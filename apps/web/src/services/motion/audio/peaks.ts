import { motionTimeToSeconds, type OriginalMediaAsset } from "@musart/core";
import { openMotionAudioSource, type MotionPcmChunk } from "@musart/render/audio";
export const WAVEFORM_BINS = 2048;

/** Original procedural sound envelope, prepared beside its WAV in the worker. */
export function prepareSfxPeaks(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const peaks = new Float32Array(Math.min(512, samples.length));
  if (peaks.length)
    accumulatePeaks(
      peaks,
      [{ timestamp: 0, sampleRate: 48000, frames: samples.length, channels: [samples] }],
      0,
      samples.length / 48000,
    );
  return peaks;
}

/** Bounded peak envelope: no PCM, binary media or GPU resources enter the document. */
export function accumulatePeaks(
  peaks: Float32Array,
  chunks: readonly MotionPcmChunk[],
  firstTimestamp: number,
  duration: number,
) {
  for (const chunk of chunks) {
    for (let frame = 0; frame < chunk.frames; frame++) {
      const position = (chunk.timestamp + frame / chunk.sampleRate - firstTimestamp) / duration;
      if (position < 0 || position >= 1) continue;
      const bin = Math.min(peaks.length - 1, Math.floor(position * peaks.length));
      for (const channel of chunk.channels)
        peaks[bin] = Math.max(peaks[bin]!, Math.abs(channel[frame] ?? 0));
    }
  }
}

/** Runs in a dedicated single-job worker, one <=1 second PCM window at a time. */
export async function prepareAudioPeaks(
  asset: OriginalMediaAsset,
  original: Blob,
  signal?: AbortSignal,
): Promise<Float32Array<ArrayBuffer>> {
  const source = await openMotionAudioSource(
    asset,
    { resolveOriginal: async () => original },
    { signal },
  );
  const peaks = new Float32Array(WAVEFORM_BINS);
  if (!source) return peaks;
  const duration = motionTimeToSeconds(asset.duration),
    first = motionTimeToSeconds(asset.firstTimestamp);
  try {
    for (let offset = 0; offset < duration; offset += 0.5) {
      signal?.throwIfAborted();
      const end = Math.min(duration, offset + 0.5);
      const chunks = await source.readWindow(first + offset, first + end, { signal });
      accumulatePeaks(peaks, chunks, first, duration);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return peaks;
  } finally {
    await source.dispose();
  }
}
