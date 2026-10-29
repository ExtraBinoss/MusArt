export interface ReplayTiming {
  duration: number;
  fps: number;
  count: number;
  historyDuration: number;
}

export function isTimelapseDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 30;
}

/** Timelapse output seconds map onto history milliseconds, including both endpoints. */
export function createReplayTiming(
  duration: number,
  fps: number,
  historyDuration: number,
): ReplayTiming {
  const count = Math.ceil(duration * fps);
  if (
    !isTimelapseDuration(duration) ||
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 60 ||
    count < 2 ||
    !Number.isFinite(historyDuration) ||
    historyDuration < 0
  )
    throw new RangeError("Invalid Timelapse timing.");
  return { duration, fps, count, historyDuration };
}

export function replayFrame(timing: ReplayTiming, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= timing.count)
    throw new RangeError("Invalid Timelapse frame index.");
  const timestamp = index / timing.fps;
  return {
    timestamp,
    duration: Math.min(1 / timing.fps, timing.duration - timestamp),
    historyTime: (timing.historyDuration * index) / (timing.count - 1),
  };
}

export function replayFrameIndex(timing: ReplayTiming, time: number): number {
  if (!Number.isFinite(time)) throw new RangeError("Invalid Timelapse time.");
  return Math.min(timing.count - 1, Math.max(0, Math.floor(time * timing.fps)));
}
