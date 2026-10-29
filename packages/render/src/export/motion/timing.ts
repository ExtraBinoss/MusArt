import {
  compareMotionTime,
  frameTime,
  motionTimeToSeconds,
  normalizeMotionFrameRate,
  normalizeMotionTime,
  subtractMotionTime,
  type MotionFrameRate,
  type MotionTime,
} from "@musart/core";
import { MotionExportError } from "./errors";

export function motionExportTiming(
  duration: MotionTime,
  rate: MotionFrameRate,
  maxFrames = 1_000_000,
) {
  const normalized = normalizeMotionTime(duration),
    frameRate = normalizeMotionFrameRate(rate);
  if (normalized.value <= 0 || !Number.isSafeInteger(maxFrames) || maxFrames < 1)
    throw new MotionExportError(
      "invalidOptions",
      "Motion export needs positive duration and frame budget.",
    );
  const numerator = BigInt(normalized.value) * BigInt(frameRate.numerator);
  const denominator = BigInt(normalized.rate) * BigInt(frameRate.denominator);
  const total = (numerator + denominator - 1n) / denominator;
  if (total > BigInt(maxFrames))
    throw new MotionExportError(
      "invalidOptions",
      "Motion export exceeds its declared frame budget.",
    );
  return { duration: normalized, frameRate, count: Number(total) };
}
export function motionExportFrame(timing: ReturnType<typeof motionExportTiming>, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= timing.count)
    throw new MotionExportError(
      "invalidOptions",
      "Motion output frame index is outside the export.",
    );
  const time = frameTime(index, timing.frameRate),
    next = frameTime(index + 1, timing.frameRate);
  const duration = subtractMotionTime(
    compareMotionTime(next, timing.duration) > 0 ? timing.duration : next,
    time,
  );
  return {
    time,
    duration,
    timestamp: motionTimeToSeconds(time),
    seconds: motionTimeToSeconds(duration),
  };
}
/** Audio ends at the last whole PCM sample, never extending the authored video duration. */
export function motionAudioSampleCount(duration: MotionTime, sampleRate: number) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new MotionExportError("invalidOptions", "Audio sample rate must be 8–192 kHz.");
  const count = (BigInt(duration.value) * BigInt(sampleRate)) / BigInt(duration.rate);
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER))
    throw new MotionExportError("invalidOptions", "Audio sample count is outside its exact range.");
  return Number(count);
}
