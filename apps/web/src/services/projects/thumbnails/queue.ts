import type { Asset, Composition, EnginePort, Project } from "@musart/core";
import type { ThumbnailStore, ThumbnailLease } from "./model";
import { thumbnailRevision } from "./revision";
import { hasThumbnailBudget } from "./scheduling";
import { ThumbnailRenderer } from "./renderer";
import { ThumbnailUrls } from "./urls";
import { ThumbnailActivity, type ActivityPort } from "./activity";
import { ThumbnailPreviews, type ThumbnailPreviewOptions } from "./previews";
interface Request {
  id: string;
  project?: Project;
  pageIds?: readonly string[];
  visible?: Set<string>;
  repair?: Set<string>;
  token: number;
}
interface Options {
  delay?: number;
  activity?: ActivityPort;
  renderer?: ThumbnailRenderer;
  urls?: ThumbnailUrls;
  onError?: (error: unknown) => void;
}
/** Latest canonical snapshots only. Queue/idle lifecycle is independent from React previews. */
export class ThumbnailPipeline {
  private readonly pending = new Map<string, Request>();
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Set<(projectId: string) => void>();
  private readonly waiters = new Set<() => void>();
  private readonly renderer: ThumbnailRenderer;
  private readonly activity: ActivityPort;
  private readonly urls: ThumbnailUrls;
  private readonly stopActivity: () => void;
  private readonly previews: ThumbnailPreviews;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private idle: number | undefined;
  private running: Promise<void> | null = null;
  private generating: Request | null = null;
  private disposed = false;
  private disposal: Promise<void> | null = null;
  constructor(
    private readonly store: ThumbnailStore,
    private readonly options: Options = {},
  ) {
    this.renderer = options.renderer ?? new ThumbnailRenderer();
    this.activity = options.activity ?? new ThumbnailActivity();
    this.urls = options.urls ?? new ThumbnailUrls();
    this.previews = new ThumbnailPreviews(
      this.renderer,
      this.activity,
      (foreground) => Boolean(this.running || (!foreground && this.pending.size)),
      () => this.arm(),
    );
    this.stopActivity = this.activity.subscribe(() => this.arm());
  }
  schedule(project: Project): void {
    const previous =
        this.pending.get(project.id) ??
        (this.generating?.id === project.id ? this.generating : null),
      pages = new Set(project.pages.map((page) => page.id));
    this.enqueue({
      id: project.id,
      project,
      visible: new Set([...(previous?.visible ?? [])].filter((id) => pages.has(id))),
      repair: new Set([...(previous?.repair ?? [])].filter((id) => pages.has(id))),
    });
  }
  request(
    projectId: string,
    pageIds?: readonly string[],
    options: { visible?: boolean; repair?: boolean } = {},
  ): void {
    const queued = this.pending.get(projectId),
      active =
        this.generating?.id === projectId && this.current(this.generating) ? this.generating : null,
      previous = queued ?? active;
    // A visible-card miss must not replace the latest all-page canonical snapshot
    // with an older disk load, or cancel another requested page midway through rendering.
    if (previous && (!previous.pageIds || pageIds?.every((id) => previous.pageIds!.includes(id)))) {
      for (const id of pageIds ?? []) {
        if (options.visible) (previous.visible ??= new Set()).add(id);
        if (options.repair) (previous.repair ??= new Set()).add(id);
      }
      // The in-flight loop may already have passed this missing page. Retain one
      // same-token repair pass without superseding the current canonical snapshot.
      if (active === previous && options.repair) this.pending.set(projectId, previous);
      this.arm();
      return;
    }
    this.enqueue({
      id: projectId,
      pageIds: previous
        ? previous.pageIds && pageIds
          ? [...new Set([...previous.pageIds, ...pageIds])]
          : undefined
        : pageIds,
      visible: new Set([...(previous?.visible ?? []), ...(options.visible ? (pageIds ?? []) : [])]),
      repair: new Set([...(previous?.repair ?? []), ...(options.repair ? (pageIds ?? []) : [])]),
    });
  }
  private enqueue(request: Omit<Request, "token">): void {
    if (this.disposed) return;
    const token = (this.versions.get(request.id) ?? 0) + 1;
    this.versions.set(request.id, token);
    this.pending.set(request.id, { ...request, token });
    while (this.pending.size > 8) this.pending.delete(this.pending.keys().next().value!);
    this.previews.wake();
    this.arm();
  }
  private cancelStart() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.idle !== undefined) {
      globalThis.cancelIdleCallback?.(this.idle);
      this.idle = undefined;
    }
  }
  private busy(visible = false) {
    return visible ? (this.activity.visibleBusy?.() ?? this.activity.busy()) : this.activity.busy();
  }
  private next() {
    return [...this.pending.values()].find((request) => !this.busy(!!request.visible?.size));
  }
  private arm() {
    this.cancelStart();
    const next = this.next();
    if (
      this.disposed ||
      this.running ||
      !next ||
      this.previews.isActive() ||
      this.previews.hasPriority()
    )
      return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        const start = (deadline?: IdleDeadline) => {
          this.idle = undefined;
          const current = this.next();
          if (this.disposed || !current) return;
          if (!current.visible?.size && !this.waiters.size && !hasThumbnailBudget(deadline)) {
            this.arm();
            return;
          }
          void this.pump();
        };
        if (!next.visible?.size && typeof globalThis.requestIdleCallback === "function")
          this.idle = requestIdleCallback(start, { timeout: 1500 });
        else start();
      },
      this.waiters.size || next.visible?.size ? 0 : (this.options.delay ?? 600),
    );
  }
  private current(request: Request) {
    return !this.disposed && this.versions.get(request.id) === request.token;
  }
  private async generate(request: Request) {
    const project = request.project ?? (await this.store.load(request.id, { observe: false }));
    if (!this.current(request)) return;
    const live = new Set(project.pages.map((page) => page.id));
    for (const ids of [request.visible, request.repair])
      for (const id of ids ?? []) if (!live.has(id)) ids!.delete(id);
    const existing = await this.store.thumbnailInfo(project.id);
    const pages = request.visible?.size
      ? [
          ...project.pages.filter((page) => request.visible!.has(page.id)),
          ...project.pages.filter((page) => !request.visible!.has(page.id)),
        ]
      : project.pages;
    for (const page of pages) {
      if (request.pageIds && !request.pageIds.includes(page.id)) continue;
      const revision = await (this.store.thumbnailRevision
        ? this.store.thumbnailRevision(page, project.assets)
        : thumbnailRevision(page, project.assets));
      if (!this.current(request)) return;
      if (
        !request.repair?.has(page.id) &&
        existing.some((item) => item.pageId === page.id && item.revision === revision)
      ) {
        request.visible?.delete(page.id);
        continue;
      }
      if (this.busy(request.visible?.has(page.id)) || this.previews.hasPriority()) {
        this.pending.set(request.id, request);
        return;
      }
      let result;
      try {
        result = await this.renderer.render(
          page,
          project.assets,
          () => this.current(request) && !this.busy(request.visible?.has(page.id)),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (this.current(request)) this.pending.set(request.id, request);
          return;
        }
        throw error;
      }
      if (!this.current(request)) return;
      if (
        await this.store.saveThumbnail({
          projectId: project.id,
          pageId: page.id,
          revision,
          ...result,
          updatedAt: project.updatedAt,
        })
      ) {
        this.urls.invalidate(project.id, page.id, revision);
        for (const listener of this.listeners) listener(project.id);
      }
      request.visible?.delete(page.id);
      request.repair?.delete(page.id);
    }
    if (this.pending.get(request.id) === request && !request.repair?.size)
      this.pending.delete(request.id);
  }
  private pump(): Promise<void> {
    if (this.running) return this.running;
    this.cancelStart();
    this.running = (async () => {
      while (this.pending.size && !this.disposed && !this.previews.hasPriority()) {
        const request = this.next();
        if (!request) break;
        this.pending.delete(request.id);
        this.generating = request;
        try {
          await this.generate(request);
        } catch (error) {
          if (!this.disposed) this.options.onError?.(error);
        } finally {
          this.generating = null;
        }
      }
    })().finally(() => {
      this.running = null;
      this.previews.wake();
      if (!this.pending.size || this.disposed) {
        for (const resolve of this.waiters) resolve();
        this.waiters.clear();
      } else this.arm();
    });
    return this.running;
  }
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.pending.size && !this.running) return Promise.resolve();
    const result = new Promise<void>((resolve) => this.waiters.add(resolve));
    this.cancelStart();
    if (this.next() && !this.previews.isActive() && !this.previews.hasPriority()) void this.pump();
    return result;
  }
  subscribe = (listener: (projectId: string) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  preview(
    key: string,
    page: Composition,
    assets: Record<string, Asset>,
    options: ThumbnailPreviewOptions = {},
  ) {
    return this.previews.preview(key, page, assets, options);
  }
  async acquire(
    projectId: string,
    pageIds?: readonly string[],
    options: { allowStale?: boolean } = {},
  ): Promise<ThumbnailLease> {
    const records = await (options.allowStale
      ? this.store.thumbnails(projectId, pageIds, true)
      : this.store.thumbnails(projectId, pageIds));
    const missing = pageIds?.filter(
      (id) => !records.some((record) => record.pageId === id && !record.stale),
    );
    if (missing?.length)
      this.request(projectId, missing, { visible: options.allowStale, repair: true });
    return this.urls.acquire(records);
  }
  remove(projectId: string): void {
    this.versions.set(projectId, (this.versions.get(projectId) ?? 0) + 1);
    this.pending.delete(projectId);
    this.previews.wake();
    this.urls.invalidate(projectId);
    if (!this.pending.size && !this.running) {
      for (const resolve of this.waiters) resolve();
      this.waiters.clear();
    }
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.cancelStart();
    this.pending.clear();
    const previews = this.previews.dispose();
    this.stopActivity();
    this.activity.dispose();
    this.disposal = Promise.allSettled([this.running, previews]).then(async (results) => {
      const failures: unknown[] = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      try {
        await this.renderer.dispose();
      } catch (error) {
        failures.push(error);
      }
      try {
        this.urls.dispose();
      } catch (error) {
        failures.push(error);
      }
      this.listeners.clear();
      for (const resolve of this.waiters) resolve();
      this.waiters.clear();
      if (failures.length) throw new AggregateError(failures, "Thumbnail pipeline cleanup failed.");
    });
    return this.disposal;
  }
}
export function installThumbnailSchedule(
  engine: EnginePort,
  pipeline: ThumbnailPipeline,
): () => void {
  let previous = engine.getSnapshot().project;
  pipeline.schedule(previous);
  return engine.subscribe(() => {
    const project = engine.getSnapshot().project;
    if (project !== previous) {
      previous = project;
      pipeline.schedule(project);
    }
  });
}
