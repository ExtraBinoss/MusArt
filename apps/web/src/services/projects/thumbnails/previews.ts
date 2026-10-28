import { hasThumbnailBudget } from "./scheduling";
import type { Asset, Composition } from "@musart/core";
import type { ActivityPort } from "./activity";
import { THUMBNAIL_EDGE } from "./model";
import type { ThumbnailRenderer } from "./renderer";

export interface ThumbnailPreviewOptions {
  edge?: number;
  priority?: "foreground" | "visible" | "background";
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}
export interface ThumbnailPreview {
  blob: Blob;
  width: number;
  height: number;
}
interface Consumer {
  options: ThumbnailPreviewOptions;
  resolve: (value: ThumbnailPreview) => void;
  reject: (error: unknown) => void;
  abort?: () => void;
}
interface Job {
  key: string;
  page: Composition;
  assets: Record<string, Asset>;
  edge: number;
  consumers: Set<Consumer>;
}
const abortError = (message = "Preview is no longer current.") =>
  new DOMException(message, "AbortError");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Bounded previews borrow one retained renderer; visible rows precede optional background work. */
export class ThumbnailPreviews {
  private readonly pending = new Map<string, Job>();
  private readonly jobs = new Map<string, Job>();
  private readonly cache = new Map<string, ThumbnailPreview>();
  private cacheBytes = 0;
  private readonly active = new Map<Job, Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private idle: number | undefined;
  private closed = false;
  private disposal: Promise<void> | null = null;
  private readonly stopActivity: () => void;
  constructor(
    private readonly renderer: Pick<ThumbnailRenderer, "render">,
    private readonly activity: Pick<
      ActivityPort,
      "busy" | "subscribe" | "interacting" | "visibleBusy"
    >,
    private readonly foreground: (priority: boolean) => boolean = () => false,
    private readonly onIdle: () => void = () => {},
  ) {
    this.stopActivity = activity.subscribe(() => this.wake());
  }
  preview(
    key: string,
    page: Composition,
    assets: Record<string, Asset>,
    options: ThumbnailPreviewOptions = {},
  ): Promise<ThumbnailPreview> {
    const edge = options.edge ?? THUMBNAIL_EDGE;
    try {
      this.assertCurrent(options);
      if (!key || !Number.isInteger(edge) || edge < 1 || edge > THUMBNAIL_EDGE)
        throw new RangeError("Invalid preview key or edge.");
    } catch (error) {
      return Promise.reject(error);
    }
    const identity = JSON.stringify([key, edge]),
      cached = this.cache.get(identity);
    if (cached) {
      this.cache.delete(identity);
      this.cache.set(identity, cached);
      return Promise.resolve().then(() => {
        this.assertCurrent(options);
        return cached;
      });
    }
    let job = this.jobs.get(identity);
    if (!job) {
      while (this.pending.size >= 32)
        this.fail(
          this.pending.values().next().value!,
          abortError("Preview queue capacity exceeded."),
        );
      job = { key: identity, page, assets, edge, consumers: new Set() };
      this.jobs.set(identity, job);
      this.pending.set(identity, job);
    }
    const current = job;
    const result = new Promise<ThumbnailPreview>((resolve, reject) => {
      const consumer: Consumer = { options, resolve, reject };
      consumer.abort = () => {
        this.reject(current, consumer, abortError("Preview was aborted."));
        this.wake();
      };
      current.consumers.add(consumer);
      options.signal?.addEventListener("abort", consumer.abort, { once: true });
    });
    this.wake();
    return result;
  }
  private assertCurrent(options: ThumbnailPreviewOptions) {
    if (this.closed || options.signal?.aborted || options.isCurrent?.() === false)
      throw abortError();
  }
  private release(job: Job, consumer: Consumer) {
    job.consumers.delete(consumer);
    if (consumer.abort) consumer.options.signal?.removeEventListener("abort", consumer.abort);
    if (!job.consumers.size && this.jobs.get(job.key) === job) {
      this.jobs.delete(job.key);
      this.pending.delete(job.key);
    }
  }
  private reject(job: Job, consumer: Consumer, error: unknown) {
    this.release(job, consumer);
    consumer.reject(error);
  }
  private fail(job: Job, error: unknown) {
    for (const consumer of job.consumers) this.reject(job, consumer, error);
  }
  private current(job: Job): boolean {
    for (const consumer of job.consumers) {
      try {
        this.assertCurrent(consumer.options);
      } catch (error) {
        this.reject(job, consumer, error);
      }
    }
    return !this.closed && this.jobs.get(job.key) === job && job.consumers.size > 0;
  }
  private isForeground(job: Job) {
    return [...job.consumers].some((consumer) => consumer.options.priority === "foreground");
  }
  private isUrgent(job: Job) {
    return [...job.consumers].some(
      (consumer) =>
        consumer.options.priority === "foreground" || consumer.options.priority === "visible",
    );
  }
  hasPriority(): boolean {
    return [...this.jobs.values()].some((job) => this.isUrgent(job));
  }
  isActive(): boolean {
    return this.active.size > 0;
  }
  private canStart(job: Job) {
    if (!this.active.size) return true;
    const smallVisible = (candidate: Job) =>
      candidate.edge === 96 && this.isUrgent(candidate) && !this.isForeground(candidate);
    return this.active.size < 2 && smallVisible(job) && [...this.active.keys()].every(smallVisible);
  }
  private blocked(job: Job) {
    const priority = this.isUrgent(job);
    const interacting = () => this.activity.interacting?.() ?? this.activity.busy();
    const busy = priority
      ? this.isForeground(job)
        ? interacting()
        : (this.activity.visibleBusy?.() ?? interacting())
      : this.activity.busy();
    return busy || this.foreground(priority);
  }
  private canRender(job: Job) {
    return this.current(job) && !this.blocked(job);
  }
  private next(): Job | undefined {
    const jobs = [...this.pending.values()];
    return (
      jobs.find((job) => this.isForeground(job) && !this.blocked(job)) ??
      jobs.find((job) => this.isUrgent(job) && !this.blocked(job)) ??
      jobs.find((job) => !this.blocked(job))
    );
  }
  private cancelStart() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.idle !== undefined) {
      globalThis.cancelIdleCallback?.(this.idle);
      this.idle = undefined;
    }
  }
  wake(): void {
    this.cancelStart();
    const next = this.next();
    if (this.closed || !next || !this.canStart(next)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const job = this.next();
      if (!job) return;
      const run = (deadline?: IdleDeadline) => {
        this.idle = undefined;
        const current = this.next();
        if (!current) return;
        if (!this.isUrgent(current) && !hasThumbnailBudget(deadline)) {
          this.wake();
          return;
        }
        this.pump();
      };
      if (!this.isUrgent(job) && typeof globalThis.requestIdleCallback === "function")
        this.idle = requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, 0);
  }
  private pump() {
    if (this.closed) return;
    const job = this.next();
    if (!job || !this.canStart(job)) return;
    this.pending.delete(job.key);
    const rendering = this.render(job).finally(() => {
      this.active.delete(job);
      this.onIdle();
      this.wake();
    });
    this.active.set(job, rendering);
    this.wake();
  }
  private async render(job: Job) {
    try {
      if (!this.canRender(job)) {
        if (this.current(job)) this.pending.set(job.key, job);
        return;
      }
      const result = await this.renderer.render(
        job.page,
        job.assets,
        () => this.canRender(job),
        job.edge,
      );
      if (!this.current(job)) return;
      if (this.blocked(job)) {
        this.pending.set(job.key, job);
        return;
      }
      this.remember(job.key, result);
      for (const consumer of job.consumers) {
        this.release(job, consumer);
        consumer.resolve(result);
      }
    } catch (error) {
      if (isAbort(error) && this.current(job) && this.blocked(job)) this.pending.set(job.key, job);
      else this.fail(job, error);
    }
  }
  private remember(key: string, value: ThumbnailPreview) {
    const bytes = value.blob.size + key.length * 2;
    if (bytes > 8 * 1024 * 1024) return;
    this.cache.set(key, value);
    this.cacheBytes += bytes;
    while (this.cache.size > 512 || this.cacheBytes > 8 * 1024 * 1024) {
      const oldest = this.cache.keys().next().value!,
        entry = this.cache.get(oldest)!;
      this.cache.delete(oldest);
      this.cacheBytes -= entry.blob.size + oldest.length * 2;
    }
  }
  stats() {
    return {
      pending: this.pending.size,
      active: this.active.size,
      cacheEntries: this.cache.size,
      cacheBytes: this.cacheBytes,
    };
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.cancelStart();
    this.stopActivity();
    for (const job of this.jobs.values()) this.fail(job, abortError("Preview queue is closed."));
    this.pending.clear();
    this.jobs.clear();
    this.cache.clear();
    this.cacheBytes = 0;
    this.disposal = Promise.allSettled(this.active.values()).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    });
    return this.disposal;
  }
}
