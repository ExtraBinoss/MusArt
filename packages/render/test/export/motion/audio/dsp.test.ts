import { expect, it } from "vitest";
import type { MotionAudioProcessing } from "@musart/core";
import {
  createMotionAudioDsp,
  motionAudioDspSettings,
  motionAudioEnvelope,
} from "../../../../src/export/motion/audio/dsp";

const processing: MotionAudioProcessing = {
  fadeIn: { value: 0, rate: 1 },
  fadeOut: { value: 0, rate: 1 },
  reverb: { mix: 1, decay: 0.1 },
};

it("preserves legacy PCM exactly and allocates no delay history without reverb", () => {
  const dsp = createMotionAudioDsp(undefined, 8000, 2);
  expect(dsp.historyFrames).toBe(0);
  for (const value of [-1.5, -0.3, 0, 0.22, 1.5]) {
    expect(dsp.sample(value, 0)).toBe(value);
    expect(motionAudioEnvelope(10, 0, 20, 0, 0)).toBe(1);
  }
  dsp.dispose();
  dsp.dispose();
  expect(() => dsp.sample(0, 0)).toThrow("closed");
});

it("diffuses a deterministic impulse within the finite horizon and resets without a tail", () => {
  const dsp = createMotionAudioDsp(processing, 8000, 2);
  expect(dsp.historyFrames).toBeLessThanOrEqual(808);
  const left: number[] = [],
    right: number[] = [];
  for (let frame = 0; frame < dsp.historyFrames + 8; frame++) {
    left.push(dsp.sample(frame === 0 ? 1 : 0, 0));
    right.push(dsp.sample(frame === 0 ? 1 : 0, 1));
  }
  expect(left[0]).toBeCloseTo(0, 12);
  expect(left.filter((value) => Math.abs(value) > 1e-10).length).toBeGreaterThan(30);
  expect(left.reduce((sum, value) => sum + Math.abs(value), 0)).toBeCloseTo(1, 12);
  expect(left).not.toEqual(right);
  expect(left.slice(dsp.historyFrames + 1)).toEqual(Array.from({ length: 7 }, () => 0));
  dsp.reset();
  expect(dsp.sample(0, 0)).toBe(0);
  dsp.dispose();
});

it("evaluates fades after wet/dry at exact clip-relative sample positions", () => {
  const settings = motionAudioDspSettings(
    {
      ...processing,
      fadeIn: { value: 1, rate: 100 },
      fadeOut: { value: 1, rate: 100 },
      reverb: { mix: 0, decay: 0.8 },
    },
    8000,
    1,
  );
  for (const [frame, expected] of [
    [100, 0],
    [140, 0.5],
    [500, 1],
    [860, 0.5],
    [900, 0],
  ])
    expect(motionAudioEnvelope(frame!, 100, 900, settings.fadeIn, settings.fadeOut)).toBe(expected);
  expect(() =>
    createMotionAudioDsp({ ...processing, reverb: { mix: 1, decay: 4 } }, 8000, 1),
  ).toThrow("budget");
});

it("accounts actual Float64 state bytes before allocation and enforces the caller budget", () => {
  const dsp = createMotionAudioDsp({ ...processing, reverb: { mix: 1, decay: 3 } }, 48000, 2);
  expect(dsp.byteLength).toBe(dsp.historyFrames * 2 * Float64Array.BYTES_PER_ELEMENT);
  expect(dsp.byteLength * 8).toBeLessThan(32 * 1024 * 1024);
  expect(() => createMotionAudioDsp(processing, 8000, 2, 1)).toThrow("budget");
  dsp.dispose();
});

it("retains an audible diffuse tail after a short tone and ends within its finite horizon", () => {
  const dsp = createMotionAudioDsp({ ...processing, reverb: { mix: 1, decay: 0.12 } }, 48000, 1);
  let energy = 0,
    samples = 0;
  for (let frame = 0; frame < 8000; frame++) {
    const input = frame < 1920 ? Math.sin((frame / 48000 + 0.36) * 2 * Math.PI * 440) * 0.3 : 0;
    const value = dsp.sample(input, 0);
    if (frame >= 3120 && frame < 5760) {
      energy += value * value;
      samples++;
    }
    if (frame > 1920 + dsp.historyFrames) expect(value).toBe(0);
  }
  expect(Math.sqrt(energy / samples)).toBeGreaterThan(0.002);
  dsp.dispose();
});
