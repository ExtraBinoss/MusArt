import { normalizeMotionTime, type MotionTime } from "@musart/core";
import { VideoSourceError } from "./errors";

/** Mediabunny restores sample PTS/duration to the track timebase after native decoding.
 * Keep those ticks for selection and interval arithmetic; VideoFrame's microseconds are separate.
 */
export function videoTrackTime(seconds: number, rate: number): MotionTime {
  if (!Number.isSafeInteger(rate) || rate <= 0 || !Number.isFinite(seconds))
    throw new VideoSourceError("unsupported", "Video track timebase is unsupported.");
  const value = Math.round(seconds * rate);
  if (!Number.isSafeInteger(value))
    throw new VideoSourceError("unsupported", "Video timestamp exceeds the track timebase range.");
  return normalizeMotionTime({ value, rate });
}
