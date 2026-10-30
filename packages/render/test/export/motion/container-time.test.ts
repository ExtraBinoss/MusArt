import { expect, test } from "vitest";
import { motionEncodedFrame, motionEncodedTiming } from "../../../src/export/motion/container-time";
import { motionExportFrame, motionExportTiming } from "../../../src/export/motion/timing";

test("WebM quantizes encoded boundaries to milliseconds while keeping rational sampling and a positive exact endpoint", () => {
  const timing = motionExportTiming(
    { value: 37, rate: 100 },
    { numerator: 30000, denominator: 1001 },
  );
  const encoded = motionEncodedTiming(timing, "video/webm");
  expect(encoded).toEqual({ resolution: 1000, duration: { value: 37, rate: 100 } });
  const frames = Array.from({ length: timing.count }, (_, i) =>
    motionEncodedFrame(timing, i, encoded.resolution),
  );
  expect(frames.map((frame) => Math.round(frame.timestamp * 1000))).toEqual([
    0, 33, 67, 100, 133, 167, 200, 234, 267, 300, 334, 367,
  ]);
  for (let i = 1; i < frames.length; i++)
    expect(frames[i - 1]!.timestamp + frames[i - 1]!.seconds).toBeCloseTo(frames[i]!.timestamp, 12);
  expect(frames.at(-1)!.seconds).toBe(0.003);
  expect(frames.at(-1)!.timestamp + frames.at(-1)!.seconds).toBeCloseTo(0.37, 12);
  expect(motionExportFrame(timing, 11).time).toEqual({ value: 11011, rate: 30000 });
});
test("MP4 declares its pinned native timescale and retains shortened final samples", () => {
  const timing = motionExportTiming({ value: 101, rate: 1000 }, { numerator: 30, denominator: 1 });
  const encoded = motionEncodedTiming(timing, "video/mp4"),
    last = motionEncodedFrame(timing, 3, encoded.resolution);
  expect(encoded).toEqual({ resolution: 57600, duration: { value: 2909, rate: 28800 } });
  expect(last.timestamp).toBe(0.1);
  expect(last.seconds).toBe(58 / 57600);
  expect(last.timestamp + last.seconds).toBeCloseTo(101 / 1000, 4);
});
test("unrepresentable rates or zero-length final samples fail instead of dropping or fabricating frames", () => {
  const short = motionExportTiming({ value: 1, rate: 10000 }, { numerator: 30, denominator: 1 });
  expect(() => motionEncodedTiming(short, "video/webm")).toThrow(/cannot be represented/);
  expect(motionEncodedTiming(short, "video/mp4").duration.value).toBeGreaterThan(0);
  const fast = motionExportTiming({ value: 1, rate: 1 }, { numerator: 2000, denominator: 1 });
  expect(() => motionEncodedTiming(fast, "video/webm")).toThrow(/timestamp resolution/);
});
