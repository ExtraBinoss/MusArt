import type { MotionPcmChunk } from "./model";

/** Linear PCM interpolation across contiguous decoder packets; real timestamp gaps are silent. */
export function sampleMotionPcm(
  chunks: readonly MotionPcmChunk[],
  time: number,
  outputChannel: number,
  outputChannels: 1 | 2,
): number {
  let low = 0,
    high = chunks.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (chunks[middle]!.timestamp <= time) low = middle + 1;
    else high = middle;
  }
  const index = low - 1,
    chunk = chunks[index];
  if (!chunk || time >= chunk.timestamp + chunk.frames / chunk.sampleRate) return 0;
  const position = Math.max(0, (time - chunk.timestamp) * chunk.sampleRate);
  const first = Math.min(chunk.frames - 1, Math.floor(position)),
    blend = position - first;
  function channel(plane: number) {
    const values = chunk!.channels[plane]!;
    const a = values[first] ?? 0;
    let b = values[first + 1];
    if (b === undefined) {
      const next = chunks[index + 1];
      const contiguous =
        next &&
        Math.abs(next.timestamp - (chunk!.timestamp + chunk!.frames / chunk!.sampleRate)) <
          0.5 / chunk!.sampleRate;
      b = contiguous ? (next.channels[Math.min(plane, next.channels.length - 1)]![0] ?? a) : a;
    }
    return a + (b - a) * blend;
  }
  if (chunk.channels.length === 1) return channel(0);
  return outputChannels === 1 ? (channel(0) + channel(1)) / 2 : channel(outputChannel);
}
