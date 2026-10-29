import type { Page } from "@playwright/test";
export interface JournalProbe {
  created: number;
  live: number;
  peak: number;
  postMax: number;
  posts: { id: number; type: string; at: number; duration: number }[];
  postSamplesDropped: number;
  acknowledgements: { id: number; at: number }[];
  parts: number;
  originalChunks: number;
  replies: number;
  headerMax: number;
  headerOnly: boolean;
  begins: { id: number; kind: string; at: number }[];
  finishes: { id: number; at: number }[];
  errors: string[];
  slowPosts: {
    at: number;
    duration: number;
    type: string;
    path?: (string | number)[];
    items?: number;
    chars?: number;
  }[];
  idb: { at: number; duration: number; store: string; method: string }[];
}
declare global {
  interface Window {
    __journalTransportProbe: JournalProbe;
  }
}

/** Time only the native postMessage call; serializing its input would contaminate the profile. */
export async function installJournalProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const stats: JournalProbe = {
      created: 0,
      live: 0,
      peak: 0,
      postMax: 0,
      posts: [],
      postSamplesDropped: 0,
      acknowledgements: [],
      parts: 0,
      originalChunks: 0,
      replies: 0,
      headerMax: 0,
      headerOnly: true,
      begins: [],
      finishes: [],
      errors: [],
      slowPosts: [],
      idb: [],
    };
    window.__journalTransportProbe = stats;
    const requests = new WeakMap<IDBRequest, { store: string; method: string }>();
    for (const method of ["get", "put"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, method)!;
      Object.defineProperty(IDBObjectStore.prototype, method, {
        ...descriptor,
        value: function (this: IDBObjectStore, ...args: unknown[]) {
          const at = performance.now(),
            request = Reflect.apply(descriptor.value, this, args) as IDBRequest;
          requests.set(request, { store: this.name, method });
          if (stats.idb.length < 2000)
            stats.idb.push({ at, duration: performance.now() - at, store: this.name, method });
          return request;
        },
      });
    }
    const descriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result")!;
    Object.defineProperty(IDBRequest.prototype, "result", {
      ...descriptor,
      get: function (this: IDBRequest) {
        const at = performance.now(),
          value = Reflect.apply(descriptor.get!, this, []),
          info = requests.get(this);
        if (info && stats.idb.length < 2000)
          stats.idb.push({
            at,
            duration: performance.now() - at,
            store: info.store,
            method: `${info.method}:result`,
          });
        return value;
      },
    });
    window.Worker = class extends NativeWorker {
      private readonly journal: boolean;
      private closed = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.journal = String(url).includes("journal.worker");
        if (!this.journal) return;
        stats.created++;
        stats.live++;
        stats.peak = Math.max(stats.peak, stats.live);
        this.addEventListener("error", (event) => stats.errors.push(event.message));
        this.addEventListener("message", (event: MessageEvent) => {
          stats.replies++;
          stats.acknowledgements.push({ id: event.data.id, at: performance.now() });
          stats.headerMax = Math.max(stats.headerMax, JSON.stringify(event.data).length);
          stats.headerOnly &&= Object.keys(event.data.result ?? {}).every(
            (key) => key === "meta" || key === "ownNext",
          );
        });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (this.journal) {
          const value = message as {
            id: number;
            type: string;
            action?: { kind: string };
            part?: { type: string; path?: (string | number)[] };
          };
          if (value.type === "begin")
            stats.begins.push({ id: value.id, kind: value.action!.kind, at: performance.now() });
          if (value.type === "finish") stats.finishes.push({ id: value.id, at: performance.now() });
          if (value.type === "part") {
            stats.parts++;
            if (value.part?.type === "string" && value.part.path?.at(-1) === "dataUrl")
              stats.originalChunks++;
          }
        }
        const before = performance.now();
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
        if (this.journal) {
          const duration = performance.now() - before;
          stats.postMax = Math.max(stats.postMax, duration);
          const envelope = message as { id: number; type: string };
          if (stats.posts.length < 10000)
            stats.posts.push({ id: envelope.id, type: envelope.type, at: before, duration });
          else stats.postSamplesDropped++;
          if (duration > 0.5 && stats.slowPosts.length < 256) {
            const request = message as {
              type: string;
              part?: { type: string; path?: (string | number)[]; value?: unknown };
            };
            stats.slowPosts.push({
              at: before,
              duration,
              type: request.part?.type ?? request.type,
              path: request.part?.path,
              items: Array.isArray(request.part?.value) ? request.part.value.length : undefined,
              chars:
                typeof request.part?.value === "string" ? request.part.value.length : undefined,
            });
          }
        }
      }
      override terminate() {
        if (this.journal && !this.closed) {
          this.closed = true;
          stats.live--;
        }
        super.terminate();
      }
    };
  });
}
