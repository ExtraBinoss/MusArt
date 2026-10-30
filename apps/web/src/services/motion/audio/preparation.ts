import { assetOriginalIdentity, type OriginalMediaAsset } from "@musart/core";
import type { AudioWorkerJob, AudioWorkerReply } from "./worker-host";

type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
interface Request {
  key: string;
  id: number;
  asset?: OriginalMediaAsset;
  preset?: string;
  resolve(value: AudioWorkerReply): void;
  reject(error: unknown): void;
}
const cancelled = () => new DOMException("Audio preparation was canceled.", "AbortError");
const replyBytes = (reply: AudioWorkerReply) =>
  ("peaks" in reply ? (reply.peaks?.byteLength ?? 0) : 0) + ("blob" in reply ? reply.blob.size : 0);

/** One worker, one lazy original read, <=32 queued jobs and a 1 MiB/64-entry result cache. */
export class AudioPreparation {
  private worker: WorkerPort | null = null;
  private active: Request | null = null;
  private controller: AbortController | null = null;
  private queue: Request[] = [];
  private readonly pending = new Map<string, Promise<AudioWorkerReply>>();
  private readonly cache = new Map<string, AudioWorkerReply>();
  private bytes = 0;
  private sequence = 0;
  private closed = false;
  private waveformsPaused = false;
  constructor(
    private readonly resolveOriginal: (
      asset: OriginalMediaAsset,
      signal: AbortSignal,
    ) => Promise<Blob>,
    private readonly createWorker: () => WorkerPort = () =>
      new Worker(new URL("./audio.worker.ts", import.meta.url), { type: "module" }),
  ) {}

  waveform(asset: OriginalMediaAsset): Promise<Float32Array<ArrayBuffer>> {
    return this.request(`waveform:${assetOriginalIdentity(asset)}`, { asset }).then((reply) => {
      if (!("peaks" in reply) || !reply.peaks) throw Error("Audio worker returned no waveform.");
      return reply.peaks;
    });
  }
  sfx(preset: string): Promise<Blob> {
    return this.request(`sfx:${preset}`, { preset }).then((reply) => {
      if (!("blob" in reply)) throw Error("Audio worker returned no sound.");
      return reply.blob;
    });
  }
  sfxWaveform(preset: string): Promise<Float32Array<ArrayBuffer>> {
    return this.request(`sfx:${preset}`, { preset }).then((reply) => {
      if (!("blob" in reply) || !("peaks" in reply) || !reply.peaks)
        throw Error("Audio worker returned no sound waveform.");
      return reply.peaks;
    });
  }
  private request(key: string, input: { asset?: OriginalMediaAsset; preset?: string }) {
    if (this.closed) return Promise.reject(cancelled());
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 32)
      return Promise.reject(
        Error("Audio preparation queue is full. Retry when visible sounds finish preparing."),
      );
    let request!: Request;
    const result = new Promise<AudioWorkerReply>((resolve, reject) => {
      request = { key, id: ++this.sequence, ...input, resolve, reject };
    });
    this.pending.set(key, result);
    this.queue.push(request);
    if (input.preset) this.yieldWaveform();
    void result
      .finally(() => {
        if (this.pending.get(key) === result) this.pending.delete(key);
      })
      .catch(() => {});
    void this.next();
    return result;
  }
  private async next() {
    if (this.active || this.closed) return;
    const sound = this.queue.findIndex((request) => request.preset !== undefined);
    const index = sound >= 0 ? sound : this.waveformsPaused ? -1 : 0;
    const request = index >= 0 ? this.queue.splice(index, 1)[0] : undefined;
    if (!request) return;
    this.active = request;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const original = request.asset
        ? await this.resolveOriginal(request.asset, controller.signal)
        : undefined;
      if (this.active !== request || this.controller !== controller || this.closed) return;
      if (!this.worker) {
        const worker = this.createWorker();
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<AudioWorkerReply>) => {
          if (this.worker === worker) this.receive(event.data);
        };
        worker.onerror = (event) => {
          if (this.worker !== worker) return;
          event.preventDefault?.();
          this.fail(Error(event.message || "Audio worker failed."));
        };
      }
      const job: AudioWorkerJob = request.asset
        ? { id: request.id, type: "waveform", asset: request.asset, original: original! }
        : { id: request.id, type: "sfx", preset: request.preset! };
      this.worker.postMessage(job);
    } catch (error) {
      if (this.active === request && this.controller === controller) this.fail(error);
    }
  }
  private yieldWaveform() {
    const active = this.active;
    if (!active?.asset) return;
    this.active = null;
    this.controller?.abort();
    this.controller = null;
    this.retireWorker();
    this.queue.unshift(active);
  }
  pauseWaveforms() {
    this.waveformsPaused = true;
    this.yieldWaveform();
    void this.next();
  }
  resumeWaveforms() {
    this.waveformsPaused = false;
    void this.next();
  }
  private retireWorker() {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
  private receive(reply: AudioWorkerReply) {
    const request = this.active;
    if (!request || request.id !== reply.id || this.closed) return;
    if ("error" in reply) {
      this.fail(Error(reply.error));
      return;
    }
    const size = replyBytes(reply);
    if (size <= 1024 * 1024) {
      this.cache.set(request.key, reply);
      this.bytes += size;
      while (this.cache.size > 64 || this.bytes > 1024 * 1024) {
        const key = this.cache.keys().next().value!,
          oldest = this.cache.get(key)!;
        this.bytes -= replyBytes(oldest);
        this.cache.delete(key);
      }
    }
    this.active = null;
    this.controller = null;
    request.resolve(reply);
    void this.next();
  }
  private fail(error: unknown) {
    const active = this.active;
    this.active = null;
    this.controller?.abort();
    this.controller = null;
    this.retireWorker();
    active?.reject(error);
    void this.next();
  }
  reset() {
    this.waveformsPaused = false;
    const requests = [...this.queue];
    this.queue = [];
    this.pending.clear();
    const active = this.active;
    this.active = null;
    this.controller?.abort();
    this.controller = null;
    this.retireWorker();
    active?.reject(cancelled());
    for (const request of requests) request.reject(cancelled());
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.reset();
    this.cache.clear();
    this.bytes = 0;
  }
}
