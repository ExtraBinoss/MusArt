import type { WandRequest, WandResponse } from "./model";
export interface WandWorkerPort {
  onmessage: ((event: MessageEvent<WandResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: WandRequest, transfer: Transferable[]): void;
  terminate(): void;
}
/** One in-flight request; the gesture controller coalesces intermediate tolerance values. */
export class WandClient {
  private sequence = 0;
  private pending: {
    id: number;
    resolve(value: WandResponse): void;
    reject(error: Error): void;
  } | null = null;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly worker: WandWorkerPort = new Worker(
      new URL("./wand.worker.ts", import.meta.url),
      { type: "module" },
    ),
    private readonly timeout = 30000,
  ) {
    worker.onmessage = ({ data }) => {
      if (!this.pending || data.id !== this.pending.id) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(this.timer);
      if ("error" in data) pending.reject(Error(data.error));
      else pending.resolve(data);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.dispose(Error(event.message || "Pixel selection worker failed."));
    };
    worker.onmessageerror = () =>
      this.dispose(Error("Pixel selection message could not be decoded."));
  }
  request(
    request: WandRequest extends infer R ? (R extends WandRequest ? Omit<R, "id"> : never) : never,
  ): Promise<WandResponse> {
    if (this.closed) return Promise.reject(Error("Pixel selection is closed."));
    if (this.pending) return Promise.reject(Error("Pixel selection is already processing."));
    const message = { ...request, id: ++this.sequence } as WandRequest;
    return new Promise((resolve, reject) => {
      this.pending = { id: message.id, resolve, reject };
      this.timer = setTimeout(
        () => this.dispose(Error("Pixel selection worker timed out.")),
        this.timeout,
      );
      try {
        this.worker.postMessage(
          message,
          message.type === "source" ? [message.data.buffer as ArrayBuffer] : [],
        );
      } catch (error) {
        clearTimeout(this.timer);
        this.pending = null;
        reject(error);
      }
    });
  }
  dispose(error: Error = new DOMException("Pixel selection cancelled.", "AbortError")) {
    if (this.closed) return;
    this.closed = true;
    this.pending?.reject(error);
    this.pending = null;
    clearTimeout(this.timer);
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
  }
}
