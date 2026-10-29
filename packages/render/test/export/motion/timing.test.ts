import { expect, it } from "vitest";
import {
  motionAudioSampleCount,
  motionExportFrame,
  motionExportTiming,
} from "../../../src/export/motion/timing";

it("samples exact half-open frame times and clips only the last frame to the authored end", () => {
  const timing = motionExportTiming({ value: 103, rate: 100 }, { numerator: 30, denominator: 1 });
  expect(timing.count).toBe(31);
  expect(motionExportFrame(timing, 0)).toMatchObject({
    time: { value: 0, rate: 1 },
    duration: { value: 1, rate: 30 },
  });
  expect(motionExportFrame(timing, 30)).toEqual({
    time: { value: 1, rate: 1 },
    duration: { value: 3, rate: 100 },
    timestamp: 1,
    seconds: 0.03,
  });
  expect(
    motionExportTiming({ value: 1001, rate: 30000 }, { numerator: 30000, denominator: 1001 }).count,
  ).toBe(1);
  expect(
    motionExportTiming({ value: 300, rate: 1 }, { numerator: 30000, denominator: 1001 }).count,
  ).toBe(8992);
  expect(motionAudioSampleCount({ value: 1, rate: 3 }, 8000)).toBe(2666);
  expect(motionAudioSampleCount({ value: 103, rate: 100 }, 48000)).toBe(49440);
});
it("rejects invalid work bounds, frame indices and audio timebases", () => {
  expect(() =>
    motionExportTiming({ value: 0, rate: 1 }, { numerator: 30, denominator: 1 }),
  ).toThrow();
  expect(() =>
    motionExportTiming({ value: 100, rate: 1 }, { numerator: 30, denominator: 1 }, 100),
  ).toThrow(/budget/);
  const timing = motionExportTiming({ value: 1, rate: 1 }, { numerator: 2, denominator: 1 });
  for (const index of [-1, 2, 0.5]) expect(() => motionExportFrame(timing, index)).toThrow();
  expect(() => motionAudioSampleCount({ value: 1, rate: 1 }, 100)).toThrow();
});
