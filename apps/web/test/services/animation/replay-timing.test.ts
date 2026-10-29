import { describe, expect, it } from "vitest";
import {
  createReplayTiming,
  isTimelapseDuration,
  replayFrame,
  replayFrameIndex,
} from "../../../src/services/animation/replay-timing";

describe("Timelapse sample mapping", () => {
  it("accepts both duration boundaries and includes both history endpoints", () => {
    for (const duration of [1, 30]) {
      const timing = createReplayTiming(duration, 30, 12345);
      expect(replayFrame(timing, 0)).toEqual({ timestamp: 0, duration: 1 / 30, historyTime: 0 });
      expect(replayFrame(timing, timing.count - 1).historyTime).toBe(12345);
      expect(replayFrameIndex(timing, duration)).toBe(timing.count - 1);
      expect(replayFrameIndex(timing, -10)).toBe(0);
      expect(replayFrameIndex(timing, duration + 1)).toBe(timing.count - 1);
    }
  });
  it("shortens only the final output sample so the requested duration is retained", () => {
    const timing = createReplayTiming(1.01, 30, 1000);
    expect(timing.count).toBe(31);
    const last = replayFrame(timing, 30);
    expect(last.timestamp).toBe(1);
    expect(last.duration).toBeCloseTo(0.01);
    expect(last.timestamp + last.duration).toBe(1.01);
    expect(last.historyTime).toBe(1000);
    expect(replayFrame(timing, 15).historyTime).toBe(500);
    expect(replayFrameIndex(timing, 0.5)).toBe(15);
  });
  it("rejects invalid durations, clocks, FPS and unsupported single-frame output", () => {
    for (const duration of [NaN, Infinity, 0, 0.9, 30.1]) {
      expect(isTimelapseDuration(duration)).toBe(false);
      expect(() => createReplayTiming(duration, 30, 1000)).toThrow(RangeError);
    }
    for (const fps of [0, 1.5, 61, NaN])
      expect(() => createReplayTiming(1, fps, 0)).toThrow(RangeError);
    expect(() => createReplayTiming(1, 1, 1000)).toThrow(RangeError);
    for (const span of [-1, Infinity, NaN])
      expect(() => createReplayTiming(1, 30, span)).toThrow(RangeError);
    const timing = createReplayTiming(1, 30, 0);
    expect(replayFrame(timing, 29).historyTime).toBe(0);
    for (const index of [-1, 0.5, 30]) expect(() => replayFrame(timing, index)).toThrow(RangeError);
    expect(() => replayFrameIndex(timing, NaN)).toThrow(RangeError);
  });
});
