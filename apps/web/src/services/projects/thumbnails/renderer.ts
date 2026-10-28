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
    maxBytes: 96 * 1024 * 1024,
    sourceMaxEdge: 640,
    ...(fontResolver ? { fontResolver } : {}),
  });
};
export class ThumbnailRenderer {
  private readonly controller = new AbortController();
  private session: Promise<ThumbnailFrameSession> | null = null;
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private readonly factory: ThumbnailSessionFactory;
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
    this.session ??= this.factory().catch((error) => {
      this.session = null;
      throw error;
    });
    const session = await this.session;
    if (this.disposed) throw new Error("Thumbnail renderer is closed.");
    const scale = Math.min(2, edge / Math.max(page.width, page.height));
    return session.withCanvasFrame(
      page,
      assets,
      async (canvas) => {
        await yieldThumbnailInput(this.controller.signal);
        if (this.disposed) throw new DOMException("Thumbnail renderer is closed.", "AbortError");
        if (canRender && !canRender()) throw new DOMException("Rendering deferred.", "AbortError");
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error("Thumbnail encoding failed."))),
            "image/webp",
            THUMBNAIL_QUALITY,
          ),
        );
        this.controller.signal.throwIfAborted();
        if (blob.type !== "image/webp" || blob.size === 0 || blob.size > MAX_THUMBNAIL_BYTES)
          throw new Error("Unsupported or oversized thumbnail.");
        return { blob, width: canvas.width, height: canvas.height };
      },
      { scale, canRender },
    );
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.controller.abort(new DOMException("Thumbnail renderer is closed.", "AbortError"));
    this.disposal = Promise.resolve(this.session)
      .catch(() => null)
      .then(async (session) => {
        await session?.dispose();
        this.session = null;
      });
    return this.disposal;
  }
}
