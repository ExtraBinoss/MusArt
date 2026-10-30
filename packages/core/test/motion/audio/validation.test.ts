import { expect, it } from "vitest";
import { validateMotionAudioTracks } from "../../../src/motion/audio/validation";
const track = () => ({
  id: "clip",
  name: "Whoosh",
  assetId: "sound",
  start: { value: 0, rate: 1 },
  end: { value: 1, rate: 1 },
  sourceIn: { value: 0, rate: 1 },
  mute: false,
  volume: 1,
});
it("accepts legacy missing audio and finite portable tracks", () => {
  expect(() => validateMotionAudioTracks(undefined, new Set())).not.toThrow();
  expect(() => validateMotionAudioTracks([track()], new Set())).not.toThrow();
});
it("rejects duplicate IDs, malformed PCM-free timing, missing originals and unsupported gains", () => {
  for (const patch of [
    { id: "" },
    { name: "x".repeat(161) },
    { assetId: "" },
    { mute: 1 },
    { volume: -1 },
    { volume: 3 },
    { start: { value: -1, rate: 1 } },
    { end: { value: 0, rate: 1 } },
    { sourceIn: { value: -1, rate: 1 } },
    { end: { value: 1, rate: 0 } },
  ])
    expect(() => validateMotionAudioTracks([{ ...track(), ...patch }], new Set())).toThrow();
  expect(() => validateMotionAudioTracks([track(), track()], new Set())).toThrow();
  expect(() => validateMotionAudioTracks([track()], new Set(), {})).toThrow("original");
});
