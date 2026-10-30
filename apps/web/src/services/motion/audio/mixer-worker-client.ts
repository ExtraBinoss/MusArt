import { isOriginalMediaAsset, type Asset, type OriginalMediaAsset } from "@musart/core";
import type { MediaSourceResolver, MotionAudioPlan } from "@musart/render";
import type { AudioMixerJob, AudioMixerReply, AudioMixerMetadata } from "./mixer-worker-model";
type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
type Call =
  Exclude<AudioMixerJob, { type: "original" }> extends infer T
    ? T extends { id: number }
      ? Omit<T, "id">
      : never
    : never;
type Response = Exclude<AudioMixerReply, { type: "original" }>;
const canceled = () => new DOMException("Audio playback preparation was canceled.", "AbortError");

/** A small media-only plan crosses the thread boundary; image data and visual keyframes stay out. */
export function audioWorkerPlan(program: MotionAudioPlan): MotionAudioPlan {
  return {
    mode: program.mode,
    duration: program.duration,
    layers: program.layers
      .filter((layer) => !!layer.media)
      .map(({ start, end, media }) => ({ start, end, media })),
    audio: program.audio,
  };
}

export async function createWorkerAudioMixer(
  program: MotionAudioPlan,
  assets: Record<string, Asset>,
  resolver: MediaSourceResolver | undefined,
  options: {
    sampleRate?: number;
    channels?: 1 | 2;
    blockFrames?: number;
    clampOutput?: boolean;
    signal?: AbortSignal;
  } = {},
  createWorker: () => WorkerPort = () =>
    new Worker(new URL("./mixer.worker.ts", import.meta.url), { type: "module" }),
) {
  options.signal?.throwIfAborted();
  const plan = audioWorkerPlan(program),
    needed = new Set(
      [...plan.layers, ...plan.audio].flatMap((lane) => (lane.media ? [lane.media.assetId] : [])),
    );
  const originals: Record<string, OriginalMediaAsset> = Object.fromEntries(
    [...needed].map((id) => {
      const asset = assets[id];
      if (!asset || !isOriginalMediaAsset(asset))
        throw Error("An audio lane has no immutable original.");
      return [id, asset];
    }),
  );
  const audioIds = new Set(plan.audio.map((lane) => lane.id));
  const worker = createWorker(),
    pending = new Map<number, { resolve(reply: Response): void; reject(error: unknown): void }>();
  const reads = new Map<number, AbortController>();
  let closed = false,
    terminated = false,
    sequence = 0,
    reading = false,
    closing: Promise<void> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  function terminate() {
    if (terminated) return;
    terminated = true;
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    options.signal?.removeEventListener("abort", aborted);
    for (const read of reads.values()) read.abort();
    reads.clear();
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    for (const request of pending.values()) request.reject(canceled());
    pending.clear();
  }
  function call(input: Call): Promise<Response> {
    if (terminated) return Promise.reject(canceled());
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ ...input, id });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }
  function dispose() {
    if (closing) return closing;
    if (terminated) return Promise.resolve();
    closed = true;
    for (const read of reads.values()) read.abort();
    reads.clear();
    for (const request of pending.values()) request.reject(canceled());
    pending.clear();
    closing = call({ type: "close" })
      .then(() => undefined)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
      })
      .finally(terminate);
    timeout = setTimeout(terminate, 300);
    return closing;
  }
  function aborted() {
    void dispose().catch(() => {
      /* Explicit dispose retains the same rejected cleanup promise. */
    });
  }
  options.signal?.addEventListener("abort", aborted, { once: true });
  worker.onerror = (event) => {
    event.preventDefault?.();
    const error = Error(event.message || "Audio processing worker failed.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    terminate();
  };
  worker.onmessage = (event: MessageEvent<AudioMixerReply>) => {
    const reply = event.data;
    if (reply.type === "original") {
      if (closed) return;
      if (reads.size >= 4) {
        worker.postMessage({
          type: "original",
          id: reply.id,
          error: "Audio original reads exceeded their bounded budget.",
        });
        return;
      }
      const controller = new AbortController();
      reads.set(reply.id, controller);
      const asset = Object.hasOwn(originals, reply.assetId) ? originals[reply.assetId] : undefined;
      void (async () => {
        if (!asset || !resolver) throw Error("Audio playback needs access to its original media.");
        const blob = await resolver.resolveOriginal(asset, { signal: controller.signal });
        if (!closed && !controller.signal.aborted)
          worker.postMessage({ type: "original", id: reply.id, blob });
      })()
        .catch((error: unknown) => {
          if (!closed && !controller.signal.aborted)
            worker.postMessage({
              type: "original",
              id: reply.id,
              error: error instanceof Error ? error.message : "Audio original could not be read.",
            });
        })
        .finally(() => {
          if (reads.get(reply.id) === controller) reads.delete(reply.id);
        });
      return;
    }
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    if (reply.type === "error")
      request.reject(
        Object.assign(Error(reply.message), {
          name: "MotionExportError",
          ...(reply.code ? { code: reply.code } : {}),
        }),
      );
    else request.resolve(reply);
  };
  try {
    const { signal: _signal, ...configuration } = options;
    const ready = await call({ type: "init", plan, assets: originals, options: configuration });
    if (ready.type !== "ready" || closed) throw canceled();
    const metadata: AudioMixerMetadata = ready.metadata;
    return {
      ...metadata,
      get hasAudio() {
        return metadata.hasAudio;
      },
      async setVolumePreview(trackId: string, volume: number | null) {
        if (closed) return;
        if (
          !audioIds.has(trackId) ||
          (volume !== null && (!Number.isFinite(volume) || volume < 0 || volume > 1))
        )
          throw new RangeError("Invalid audio volume draft.");
        const result = await call({ type: "volume", trackId, volume });
        if (result.type !== "updated") throw Error("Audio volume preview was not acknowledged.");
        metadata.hasAudio = result.hasAudio;
      },
      async setMixState(trackId: string, state: { volume: number; mute: boolean }) {
        if (closed) return;
        if (
          !audioIds.has(trackId) ||
          !Number.isFinite(state.volume) ||
          state.volume < 0 ||
          state.volume > 2 ||
          typeof state.mute !== "boolean"
        )
          throw new RangeError("Invalid authored audio mix state.");
        const result = await call({ type: "mixState", trackId, ...state });
        if (result.type !== "updated") throw Error("Authored audio mix was not acknowledged.");
        metadata.hasAudio = result.hasAudio;
      },
      async readBlock(start: number, count: number): Promise<Float32Array<ArrayBuffer>> {
        if (closed) throw canceled();
        if (reading) throw Error("Audio mix blocks must be consumed serially.");
        reading = true;
        try {
          const result = await call({ type: "read", start, count });
          if (result.type !== "pcm") throw Error("Audio worker returned no PCM block.");
          return result.pcm;
        } finally {
          reading = false;
        }
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
