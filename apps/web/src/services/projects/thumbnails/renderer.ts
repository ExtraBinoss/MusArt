import { yieldThumbnailInput } from "./scheduling";
import type { Asset, Composition } from "@musart/core";
import type { FontResolver } from "@musart/render";
import { MAX_THUMBNAIL_BYTES, THUMBNAIL_EDGE, THUMBNAIL_QUALITY } from "./model";
export interface ThumbnailFrameSession {
  withCanvasFrame<T>(
    page: Composition,
    assets: Record<string, Asset>,
    consume: (canvas: HTMLCanvasElement) => T | Promise<T>,
    options: { scale: number; canRender?: () => boolean },
  ): Promise<T>;
  dispose(): Promise<void>;
}
export type ThumbnailSessionFactory = () => Promise<ThumbnailFrameSession>;
const createSession = async (fontResolver?: FontResolver): Promise<ThumbnailFrameSession> => {
  const { createRenderSession } = await import("@musart/render");
  return createRenderSession({
    maxBytes: 384 * 1024 * 1024,
    ...(fontResolver ? { fontResolver } : {}),
  });
};
export class ThumbnailRenderer {
  private readonly controller = new AbortController();
  private session: Promise<ThumbnailFrameSession> | null = null;
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private readonly factory: ThumbnailSessionFactory;
  private readonly encodings = new Set<Promise<Blob>>();
  private readonly slots = new Set<Promise<void>>();
  constructor(factory?: ThumbnailSessionFactory, fontResolver?: FontResolver) {
    this.factory = factory ?? (() => createSession(fontResolver));
  }
  async render(
    page: Composition,
    assets: Record<string, Asset>,
    canRender?: () => boolean,
    edge = THUMBNAIL_EDGE,
  ) {
    if (this.disposed) throw new Error("Thumbnail renderer is closed.");
    if (canRender && !canRender()) throw new DOMException("Rendering deferred.", "AbortError");
    if (!Number.isInteger(edge) || edge < 1 || edge > THUMBNAIL_EDGE)
      throw new RangeError("Invalid thumbnail edge.");
    const allowed = () =>
      !this.disposed && !this.controller.signal.aborted && (!canRender || canRender());
    this.session ??= this.factory().catch((error) => {
      this.session = null;
      throw error;
    });
    const session = await this.session;
    if (this.disposed) throw new Error("Thumbnail renderer is closed.");
    await yieldThumbnailInput(this.controller.signal);
    if (!allowed()) throw new DOMException("Rendering deferred.", "AbortError");
    const release = await this.admit();
    try {
      const scale = Math.min(8, edge / Math.max(page.width, page.height));
      const frame = await session.withCanvasFrame(
        page,
        assets,
        (canvas) => {
          if (!allowed()) throw new DOMException("Rendering deferred.", "AbortError");
          const width = canvas.width,
            height = canvas.height;
          // Start the native snapshot in the SAME task as the draw. WebGL's
          // default framebuffer may be cleared at presentation after any await.
          const encoding = new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) => (value ? resolve(value) : reject(new Error("Thumbnail encoding failed."))),
              "image/webp",
              THUMBNAIL_QUALITY,
            ),
          );
          this.encodings.add(encoding);
          void encoding.then(
            () => this.encodings.delete(encoding),
            () => this.encodings.delete(encoding),
          );
          return { encoding, width, height };
        },
        { scale, canRender: allowed },
      );
      const blob = await frame.encoding;
      this.controller.signal.throwIfAborted();
      if (blob.type !== "image/webp" || blob.size === 0 || blob.size > MAX_THUMBNAIL_BYTES)
        throw new Error("Unsupported or oversized thumbnail.");
      return { blob, width: frame.width, height: frame.height };
    } finally {
      release();
    }
  }
  private async admit(): Promise<() => void> {
    const signal = this.controller.signal;
    signal.throwIfAborted();
    while (this.slots.size >= 2) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          signal.removeEventListener("abort", abort);
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        void Promise.race(this.slots).then(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        });
      });
      signal.throwIfAborted();
    }
    let finish!: () => void;
    const slot = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.slots.add(slot);
    return () => {
      this.slots.delete(slot);
      finish();
    };
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.controller.abort(new DOMException("Thumbnail renderer is closed.", "AbortError"));
    this.disposal = Promise.resolve(this.session)
      .catch(() => null)
      .then(async (session) => {
        await Promise.allSettled(this.encodings);
        await session?.dispose();
        this.session = null;
      });
    return this.disposal;
  }
}
