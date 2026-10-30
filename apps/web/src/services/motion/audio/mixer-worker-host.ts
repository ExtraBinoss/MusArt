import { createMotionAudioMixer } from "@musart/render/audio";
import type { AudioMixerJob, AudioMixerReply } from "./mixer-worker-model";
type Mixer = Awaited<ReturnType<typeof createMotionAudioMixer>>;

/** Dedicated audio DSP/decoder thread; original Blobs are requested lazily from the platform. */
export function createAudioMixerWorkerHost(
  send: (reply: AudioMixerReply, transfer?: Transferable[]) => void,
) {
  let mixer: Mixer | null = null,
    initialization: Promise<void> | null = null,
    closed = false,
    sequence = 0,
    reading = false;
  const controller = new AbortController();
  const originals = new Map<
    number,
    { resolve(blob: Blob): void; reject(error: unknown): void; cleanup(): void }
  >();
  const error = (id: number, failure: unknown) => {
    const code =
      failure &&
      typeof failure === "object" &&
      "code" in failure &&
      typeof failure.code === "string"
        ? failure.code
        : undefined;
    send({
      type: "error",
      id,
      message: failure instanceof Error ? failure.message : "Audio processing failed.",
      ...(code ? { code } : {}),
    });
  };
  async function initialize(job: Extract<AudioMixerJob, { type: "init" }>) {
    try {
      mixer = await createMotionAudioMixer(
        job.plan,
        job.assets,
        {
          resolveOriginal: (asset, options) =>
            new Promise<Blob>((resolve, reject) => {
              if (closed) {
                reject(new DOMException("Audio session closed.", "AbortError"));
                return;
              }
              const id = ++sequence,
                signal = options?.signal;
              const abort = () => {
                originals.delete(id);
                reject(signal?.reason ?? new DOMException("Audio read canceled.", "AbortError"));
              };
              signal?.addEventListener("abort", abort, { once: true });
              originals.set(id, {
                resolve,
                reject,
                cleanup: () => signal?.removeEventListener("abort", abort),
              });
              send({ type: "original", id, assetId: asset.id });
            }),
        },
        { ...job.options, signal: controller.signal },
      );
      if (closed) {
        await mixer.dispose();
        mixer = null;
        return;
      }
      const { sampleRate, channels, blockFrames, samples, hasAudio } = mixer;
      send({
        type: "ready",
        id: job.id,
        metadata: { sampleRate, channels, blockFrames, samples, hasAudio },
      });
    } catch (failure) {
      if (!closed) error(job.id, failure);
    }
  }
  async function receive(job: AudioMixerJob) {
    if (job.type === "original") {
      const pending = originals.get(job.id);
      if (!pending) return;
      originals.delete(job.id);
      pending.cleanup();
      if (job.blob instanceof Blob) pending.resolve(job.blob);
      else pending.reject(Error(job.error ?? "Audio original could not be read."));
      return;
    }
    if (job.type === "close") {
      if (closed) {
        send({ type: "closed", id: job.id });
        return;
      }
      closed = true;
      controller.abort();
      for (const pending of originals.values()) {
        pending.cleanup();
        pending.reject(new DOMException("Audio session closed.", "AbortError"));
      }
      originals.clear();
      try {
        await initialization;
        await mixer?.dispose();
        mixer = null;
        send({ type: "closed", id: job.id });
      } catch (failure) {
        error(job.id, failure);
      }
      return;
    }
    if (closed) {
      error(job.id, Error("Audio worker is closed."));
      return;
    }
    if (job.type === "init") {
      if (initialization) {
        error(job.id, Error("Audio worker is already initialized."));
        return;
      }
      initialization = initialize(job);
      await initialization;
      return;
    }
    if (job.type === "mixState") {
      try {
        if (!mixer) throw Error("Audio mixer has not initialized.");
        mixer.setMixState(job.trackId, { volume: job.volume, mute: job.mute });
        send({ type: "updated", id: job.id, hasAudio: mixer.hasAudio });
      } catch (failure) {
        error(job.id, failure);
      }
      return;
    }
    if (job.type === "volume") {
      try {
        if (!mixer) throw Error("Audio volume preview is unavailable.");
        mixer.setVolumePreview(job.trackId, job.volume);
        send({ type: "updated", id: job.id, hasAudio: mixer.hasAudio });
      } catch (failure) {
        error(job.id, failure);
      }
      return;
    }
    if (!mixer || reading) {
      error(job.id, Error("Audio processing is busy or has not initialized."));
      return;
    }
    reading = true;
    try {
      const pcm = await mixer.readBlock(job.start, job.count);
      if (!closed) send({ type: "pcm", id: job.id, pcm }, [pcm.buffer]);
    } catch (failure) {
      if (!closed) error(job.id, failure);
    } finally {
      reading = false;
    }
  }
  return { receive };
}
