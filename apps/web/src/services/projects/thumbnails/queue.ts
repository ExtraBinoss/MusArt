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
    this.stopActivity = this.activity.subscribe(() => {
      if (this.activity.busy()) this.cancelStart();
      else this.arm();
    });
  }
  schedule(project: Project): void {
    this.enqueue({ id: project.id, project });
  }
  request(projectId: string, pageIds?: readonly string[]): void {
    this.enqueue({ id: projectId, pageIds });
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
  private arm() {
    this.cancelStart();
    if (
      this.disposed ||
      this.running ||
      !this.pending.size ||
      this.activity.busy() ||
      this.previews.isActive() ||
      this.previews.hasForeground()
    )
      return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        if (this.activity.busy()) return;
        const start = (deadline?: IdleDeadline) => {
          this.idle = undefined;
          if (this.disposed || this.activity.busy()) return;
          if (!this.waiters.size && !hasThumbnailBudget(deadline)) {
            this.arm();
            return;
          }
          void this.pump();
        };
        if (typeof globalThis.requestIdleCallback === "function")
          this.idle = requestIdleCallback(start, { timeout: 1500 });
        else start();
      },
      this.waiters.size ? 0 : (this.options.delay ?? 600),
    );
  }
  private current(request: Request) {
    return !this.disposed && this.versions.get(request.id) === request.token;
  }
  private async generate(request: Request) {
    const project = request.project ?? (await this.store.load(request.id, { observe: false }));
    if (!this.current(request)) return;
    const existing = await this.store.thumbnailInfo(project.id);
    for (const page of project.pages) {
      if (request.pageIds && !request.pageIds.includes(page.id)) continue;
      const revision = await (this.store.thumbnailRevision
        ? this.store.thumbnailRevision(page, project.assets)
        : thumbnailRevision(page, project.assets));
      if (!this.current(request)) return;
      if (existing.some((item) => item.pageId === page.id && item.revision === revision)) continue;
      if (this.activity.busy() || this.previews.hasForeground()) {
        this.pending.set(request.id, request);
        return;
      }
      let result;
      try {
        result = await this.renderer.render(
          page,
          project.assets,
          () => this.current(request) && !this.activity.busy(),
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
    }
  }
  private pump(): Promise<void> {
    if (this.running) return this.running;
    this.cancelStart();
    this.running = (async () => {
      while (
        this.pending.size &&
        !this.disposed &&
        !this.activity.busy() &&
        !this.previews.hasForeground()
      ) {
        const request = this.pending.values().next().value!;
        this.pending.delete(request.id);
        try {
          await this.generate(request);
        } catch (error) {
          if (!this.disposed) this.options.onError?.(error);
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
    if (!this.activity.busy() && !this.previews.isActive() && !this.previews.hasForeground())
      void this.pump();
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
  async acquire(projectId: string, pageIds?: readonly string[]): Promise<ThumbnailLease> {
    const records = await this.store.thumbnails(projectId, pageIds);
    if (pageIds?.some((id) => !records.some((record) => record.pageId === id)))
      this.request(projectId, pageIds);
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
