import { expect, test } from "vitest";
import { videoTrackTime } from "../../../src/sources/video/time";

test("preserves positive and negative NTSC ticks independently of native microseconds", () => {
  expect(videoTrackTime(1001 / 30000, 30000)).toEqual({ value: 1001, rate: 30000 });
  expect(videoTrackTime(2002 / 30000, 30000)).toEqual({ value: 1001, rate: 15000 });
  expect(videoTrackTime(-1001 / 30000, 30000)).toEqual({ value: -1001, rate: 30000 });
  expect(videoTrackTime(0, 30000)).toEqual({ value: 0, rate: 1 });
});
test("rejects invalid rates, nonfinite timestamps and unsafe integer tick ranges", () => {
  for (const rate of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => videoTrackTime(1, rate)).toThrow("timebase");
  for (const seconds of [NaN, Infinity, -Infinity])
    expect(() => videoTrackTime(seconds, 30000)).toThrow("timebase");
  expect(() => videoTrackTime(Number.MAX_SAFE_INTEGER, 30000)).toThrow("range");
});
