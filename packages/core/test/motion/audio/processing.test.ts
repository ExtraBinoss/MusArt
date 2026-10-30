import { expect, it } from "vitest";
import {
  DEFAULT_AUDIO_PROCESSING,
  resolveMotionAudioProcessing,
  validateMotionAudioProcessing,
} from "../../../src/motion/audio/processing";
const duration = { value: 2, rate: 1 };
const processing = () => ({
  fadeIn: { value: 1, rate: 4 },
  fadeOut: { value: 1, rate: 2 },
  reverb: { mix: 0.3, decay: 0.8 },
});
it("preserves legacy dry audio and exposes frozen defaults with no implicit processing", () => {
  expect(resolveMotionAudioProcessing()).toBe(DEFAULT_AUDIO_PROCESSING);
  expect(DEFAULT_AUDIO_PROCESSING.reverb.mix).toBe(0);
  expect(Object.isFrozen(DEFAULT_AUDIO_PROCESSING.reverb)).toBe(true);
  const value = processing();
  expect(resolveMotionAudioProcessing(value)).toBe(value);
  expect(() => validateMotionAudioProcessing(undefined, duration)).not.toThrow();
  expect(() => validateMotionAudioProcessing(value, duration)).not.toThrow();
});
it("rejects unbounded fades, non-finite room parameters and unknown processing", () => {
  for (const patch of [
    { fadeIn: { value: 3, rate: 1 } },
    { fadeOut: { value: -1, rate: 1 } },
    { fadeOut: { value: 1, rate: 0 } },
    { reverb: { mix: NaN, decay: 0.8 } },
    { reverb: { mix: 0.5, decay: 5 } },
    { reverb: { mix: 0.5, decay: 0.8, impulse: [] } },
    { effect: "unknown" },
  ])
    expect(() => validateMotionAudioProcessing({ ...processing(), ...patch }, duration)).toThrow();
});
