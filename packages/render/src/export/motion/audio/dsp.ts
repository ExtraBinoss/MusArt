import {
  motionTimeToSeconds,
  resolveMotionAudioProcessing,
  type MotionAudioProcessing,
} from "@musart/core";
import { MotionExportError } from "../errors";

const DELAY_WEIGHTS = [11, 17, 23, 31, 43, 59, 79, 107] as const;
const WEIGHT_SUM = DELAY_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
const FEED = 0.65;
const NORMALIZATION = 1 + FEED;
const DIRECT_GAIN = NORMALIZATION ** -DELAY_WEIGHTS.length;

export function motionAudioDspSettings(
  processing: MotionAudioProcessing | undefined,
  sampleRate: number,
  channels: 1 | 2,
) {
  const resolved = resolveMotionAudioProcessing(processing);
  const fadeIn = motionTimeToSeconds(resolved.fadeIn) * sampleRate,
    fadeOut = motionTimeToSeconds(resolved.fadeOut) * sampleRate,
    { mix, decay } = resolved.reverb;
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    (channels !== 1 && channels !== 2) ||
    !Number.isFinite(fadeIn) ||
    fadeIn < 0 ||
    !Number.isFinite(fadeOut) ||
    fadeOut < 0 ||
    !Number.isFinite(mix) ||
    mix < 0 ||
    mix > 1 ||
    !Number.isFinite(decay) ||
    decay < 0.1 ||
    decay > 3
  )
    throw new MotionExportError(
      "invalidOptions",
      "Audio processing exceeds its finite DSP budget.",
    );
  return { fadeIn, fadeOut, mix, decay };
}

/** Fades act on the wet/dry result; both use the same absolute output sample clock. */
export function motionAudioEnvelope(
  frame: number,
  first: number,
  after: number,
  fadeIn: number,
  fadeOut: number,
) {
  return (
    (fadeIn > 0 ? Math.min(1, Math.max(0, (frame - first) / fadeIn)) : 1) *
    (fadeOut > 0 ? Math.min(1, Math.max(0, (after - frame) / fadeOut)) : 1)
  );
}

/** Finite diffuse delay: eight feed-forward stages, no feedback or unbounded tail. */
export function createMotionAudioDsp(
  processing: MotionAudioProcessing | undefined,
  sampleRate: number,
  channels: 1 | 2,
  maxStateBytes = 32 * 1024 * 1024,
) {
  const { mix, decay } = motionAudioDspSettings(processing, sampleRate, channels);
  const lengths =
    mix > 0
      ? DELAY_WEIGHTS.map((weight) =>
          Math.max(1, Math.round((decay * sampleRate * weight) / WEIGHT_SUM)),
        )
      : [];
  const historyFrames = lengths.reduce((sum, length) => sum + length, 0);
  const byteLength = historyFrames * channels * Float64Array.BYTES_PER_ELEMENT;
  if (byteLength > maxStateBytes)
    throw new MotionExportError(
      "unsupportedAudio",
      "Concurrent audio reverb exceeds the 32 MiB DSP state budget.",
    );
  const planes = Array.from({ length: channels }, () =>
    lengths.map((length) => new Float64Array(length)),
  );
  const cursors = Array.from({ length: channels }, () => lengths.map(() => 0));
  let closed = false;
  return {
    historyFrames,
    byteLength,
    sample(input: number, channel: number) {
      if (closed) throw new MotionExportError("closed", "Audio DSP is closed.");
      if (mix === 0) return input;
      let value = input;
      for (let stage = 0; stage < lengths.length; stage++) {
        const ring = planes[channel]![stage]!;
        const cursor = cursors[channel]![stage]!;
        const delayed = ring[cursor]!;
        ring[cursor] = value;
        cursors[channel]![stage] = cursor + 1 === ring.length ? 0 : cursor + 1;
        // Opposite signs decorrelate the right channel without changing its peak budget.
        const sign = channel === 1 && stage % 2 === 1 ? -1 : 1;
        value = (value + sign * FEED * delayed) / NORMALIZATION;
      }
      const wet = (value - DIRECT_GAIN * input) / (1 - DIRECT_GAIN);
      return input * (1 - mix) + wet * mix;
    },
    reset() {
      if (closed) throw new MotionExportError("closed", "Audio DSP is closed.");
      for (let channel = 0; channel < channels; channel++) {
        for (const ring of planes[channel]!) ring.fill(0);
        cursors[channel]!.fill(0);
      }
    },
    dispose() {
      if (closed) return;
      closed = true;
      planes.length = 0;
      cursors.length = 0;
    },
  };
}
