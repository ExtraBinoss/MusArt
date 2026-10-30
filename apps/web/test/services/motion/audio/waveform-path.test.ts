import { expect, it } from "vitest";
import { waveformPath } from "../../../../src/services/motion/audio/waveform-path";
it("renders only the visible continuous mountain and maps source trims to the correct cached peaks", () => {
  const peaks = new Float32Array([0, 0.25, 0.5, 1]);
  const path = waveformPath(peaks, {
    width: 12000,
    left: 6000,
    visibleWidth: 300,
    sourceIn: 0,
    clipDuration: 4,
    sourceDuration: 4,
  });
  expect(path.match(/M/g)).toHaveLength(1);
  expect(path.match(/Q/g)!.length).toBeLessThanOrEqual(202);
  expect(path).toContain("M6000.0,8.0");
  expect(path.endsWith("Z")).toBe(true);
  expect(path).not.toContain("M0.0");
  expect(
    waveformPath(peaks, {
      width: 0,
      left: 0,
      visibleWidth: 100,
      sourceIn: 0,
      clipDuration: 1,
      sourceDuration: 4,
    }),
  ).toBe("");
});
