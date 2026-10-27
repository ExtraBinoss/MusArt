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
  | { id: number; result: MaskResult | null }
  | { id: number; error: string };
export interface WorkerPort {
  postMessage(message: SelectionRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<SelectionResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
/** A worker owns the model and one image embedding; one active job prevents unbounded queues. */
export class SelectionClient {
  private worker: WorkerPort | undefined;
  private nextId = 0;
  private pending:
    | { id: number; resolve: (result: MaskResult | null) => void; reject: (error: Error) => void }
    | undefined;
  constructor(
    private readonly createWorker = (): WorkerPort =>
      new Worker(new URL("./selection.worker.ts", import.meta.url), { type: "module" }),
  ) {}
  private connect() {
    if (this.worker) return this.worker;
    this.worker = this.createWorker();
    this.worker.onmessage = ({ data }) => {
      if (!this.pending || this.pending.id !== data.id) return;
      const pending = this.pending;
      this.pending = undefined;
      if ("error" in data) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    };
    this.worker.onerror = (event) => {
      this.pending?.reject(new Error(event.message || "Le worker de sélection a échoué."));
      this.pending = undefined;
      this.worker?.terminate();
      this.worker = undefined;
    };
    return this.worker;
  }
  request(request: SelectionRequest): Promise<MaskResult | null> {
    if (this.pending) return Promise.reject(new Error("Une sélection est déjà en cours."));
    return new Promise((resolve, reject) => {
      const worker = this.connect();
      this.pending = { id: request.id, resolve, reject };
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
  dispose() {
    this.pending?.reject(new Error("Sélection annulée."));
    this.pending = undefined;
    this.worker?.terminate();
    this.worker = undefined;
  }
}
