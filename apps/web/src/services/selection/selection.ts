import { LocalModelManager } from "./model/manager";
import type { ModelDownloadEvent } from "./model/contract";

export type SelectionRequest =
  | { id: number; type: "prepare" }
  | { id: number; type: "segment"; dataUrl: string; x: number; y: number }
  | {
      id: number;
      type: "wand";
      pixels: Uint8ClampedArray;
      width: number;
      height: number;
      x: number;
      y: number;
      tolerance: number;
    };
export interface MaskResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export type SelectionResponse =
  | { id: number; progress: ModelDownloadEvent }
  | { id: number; result: MaskResult | null }
  | { id: number; error: string };
export interface WorkerPort {
  postMessage(message: SelectionRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<SelectionResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
}
/** A worker owns the model and one image embedding; one active job prevents unbounded queues. */
export class SelectionClient {
  readonly model: LocalModelManager;
  private worker: WorkerPort | undefined;
  private nextId = 0;
  private pending:
    | {
        id: number;
        type: SelectionRequest["type"];
        resolve: (result: MaskResult | null) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  constructor(
    private readonly createWorker = (): WorkerPort =>
      new Worker(new URL("./selection.worker.ts", import.meta.url), { type: "module" }),
  ) {
    this.model = new LocalModelManager({
      prepare: () => this.prepare(),
      cancel: () => this.resetWorker(),
    });
  }
  private connect() {
    if (this.worker) return this.worker;
    this.worker = this.createWorker();
    this.worker.onmessage = ({ data }) => {
      if (!this.pending || this.pending.id !== data.id) return;
      if ("progress" in data) {
        this.model.note(data.progress);
        return;
      }
      const pending = this.pending;
      this.pending = undefined;
      if ("error" in data) {
        this.model.failed(data.error);
        pending.reject(new Error(data.error));
      } else {
        if (pending.type !== "wand") this.model.ready();
        pending.resolve(data.result);
      }
    };
    this.worker.onerror = (event) => {
      this.model.failed(event.message || "The model worker failed.");
      this.pending?.reject(new Error(event.message || "Le worker de sélection a échoué."));
      this.pending = undefined;
      this.resetWorker();
    };
    this.worker.onmessageerror = () => {
      const error = new Error("The selection worker response could not be decoded.");
      this.model.failed(error);
      this.pending?.reject(error);
      this.pending = undefined;
      this.resetWorker();
    };
    return this.worker;
  }
  request(request: SelectionRequest): Promise<MaskResult | null> {
    if (this.pending) return Promise.reject(new Error("Une sélection est déjà en cours."));
    return new Promise((resolve, reject) => {
      const worker = this.connect();
      this.pending = { id: request.id, type: request.type, resolve, reject };
      try {
        worker.postMessage(
          request,
          request.type === "wand" ? [request.pixels.buffer as ArrayBuffer] : [],
        );
      } catch (error) {
        this.pending = undefined;
        reject(error);
      }
    });
  }
  async prepare() {
    await this.request({ id: ++this.nextId, type: "prepare" });
  }
  async segment(dataUrl: string, x: number, y: number) {
    const result = await this.request({ id: ++this.nextId, type: "segment", dataUrl, x, y });
    if (!result) throw new Error("Masque absent.");
    return result;
  }
  async wand(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    tolerance: number,
  ) {
    const result = await this.request({
      id: ++this.nextId,
      type: "wand",
      pixels,
      width,
      height,
      x,
      y,
      tolerance,
    });
    if (!result) throw new Error("Masque absent.");
    return result;
  }
  private resetWorker() {
    this.pending?.reject(new DOMException("Sélection annulée.", "AbortError"));
    this.pending = undefined;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = undefined;
  }
  dispose() {
    this.resetWorker();
    this.model.dispose();
  }
}
