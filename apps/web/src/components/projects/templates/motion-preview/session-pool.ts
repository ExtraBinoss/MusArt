import type { createRenderSession, RenderOptions } from "@musart/render";

export type PreviewSession = Pick<
  ReturnType<typeof createRenderSession>,
  "withCanvasFrame" | "dispose"
>;
type Options = RenderOptions & { maxBytes: number };
interface Entry {
  session: PreviewSession;
  options: Options;
  leased: boolean;
  failed: boolean;
}

/** One exclusive renderer. Idle retention keeps its bounded geometry, fonts and shaders warm. */
export class PreviewSessionPool {
  private entry: Entry | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly create: (options: Options) => Promise<PreviewSession>,
    private readonly onClear: () => void = () => {},
    private readonly idleMs = 30_000,
  ) {}
  acquire(options: Options): Promise<PreviewSession> {
    const job = this.queue.then(async () => {
      clearTimeout(this.timer);
      this.timer = undefined;
      if (this.entry?.leased) throw Error("The preview renderer already has an owner.");
      if (
        this.entry &&
        (this.entry.failed ||
          this.entry.options.fontResolver !== options.fontResolver ||
          this.entry.options.maxBytes !== options.maxBytes ||
          this.entry.options.forceWebGL !== options.forceWebGL)
      )
        await this.retire();
      if (!this.entry) {
        // Hover signals and media resolvers belong to frames, never the retained renderer.
        const configuration = {
          maxBytes: options.maxBytes,
          fontResolver: options.fontResolver,
          forceWebGL: options.forceWebGL,
        };
        this.entry = {
          session: await this.create(configuration),
          options: configuration,
          leased: false,
          failed: false,
        };
      }
      const entry = this.entry;
      entry.leased = true;
      let released = false;
      return {
        withCanvasFrame: async (...args) => {
          if (released) throw Error("The preview lease is closed.");
          try {
            return await entry.session.withCanvasFrame(...args);
          } catch (error) {
            if (!(error instanceof Error && error.name === "AbortError")) entry.failed = true;
            throw error;
          }
        },
        dispose: async () => {
          if (released) return;
          released = true;
          entry.leased = false;
          if (entry.failed) await this.clear();
          else if (this.entry === entry)
            this.timer = setTimeout(() => {
              void this.clear().catch((error: unknown) => console.error(error));
            }, this.idleMs);
        },
      } satisfies PreviewSession;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
  clear(): Promise<void> {
    const job = this.queue.then(async () => {
      // Active owners release after their last acknowledged frame, before clearing.
      if (this.entry?.leased) return;
      await this.retire();
      this.onClear();
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
  private async retire() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const entry = this.entry;
    this.entry = undefined;
    await entry?.session.dispose();
  }
}
