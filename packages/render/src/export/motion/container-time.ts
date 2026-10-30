import { addMotionTime, normalizeMotionTime, type MotionTime } from "@musart/core";
import { MotionExportError } from "./errors";
import { motionExportFrame, type motionExportTiming } from "./timing";
type Timing = ReturnType<typeof motionExportTiming>;

/** Pinned Mediabunny timebases without frameRate metadata (which would resnap the final duration). */
export function motionTimestampResolution(mimeType: "video/mp4" | "video/webm"): number {
  return mimeType === "video/webm" ? 1000 : 57600;
}
function nearestTick(time: MotionTime, resolution: number): number {
  const scaled = BigInt(time.value) * BigInt(resolution),
    denominator = BigInt(time.rate);
  const tick = (scaled * 2n + denominator) / (denominator * 2n);
  if (tick < 0n || tick > BigInt(Number.MAX_SAFE_INTEGER))
    throw new MotionExportError(
      "invalidOptions",
      "Encoded time exceeds the container's exact range.",
    );
  return Number(tick);
}
/** The GPU still samples frame.time; only the encoded interval is placed on the container grid. */
export function motionEncodedFrame(timing: Timing, index: number, resolution: number) {
  const frame = motionExportFrame(timing, index);
  const first = nearestTick(frame.time, resolution);
  const after = nearestTick(addMotionTime(frame.time, frame.duration), resolution);
  if (after <= first)
    throw new MotionExportError(
      "containerPrecision",
      "This frame duration cannot be represented by the chosen container.",
    );
  return { timestamp: first / resolution, seconds: (after - first) / resolution };
}
export function motionEncodedTiming(timing: Timing, mimeType: "video/mp4" | "video/webm") {
  const resolution = motionTimestampResolution(mimeType);
  if (
    BigInt(timing.frameRate.numerator) >
    BigInt(resolution) * BigInt(timing.frameRate.denominator)
  )
    throw new MotionExportError(
      "containerPrecision",
      "This frame rate exceeds the container's timestamp resolution.",
    );
  // A shortened final sample must remain positive; never drop it or append a fabricated frame.
  motionEncodedFrame(timing, timing.count - 1, resolution);
  return {
    resolution,
    duration: normalizeMotionTime({
      value: nearestTick(timing.duration, resolution),
      rate: resolution,
    }),
  };
}
