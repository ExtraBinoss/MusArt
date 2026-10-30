import { expect, it } from "vitest";
import * as audio from "../src/audio";
it("exposes the shared audio implementation through a GPU-free public entry point", () => {
  expect(Object.keys(audio).sort()).toEqual([
    "createMotionAudioMixer",
    "openMotionAudioSource",
    "probeAudioOriginal",
  ]);
  for (const value of Object.values(audio)) expect(typeof value).toBe("function");
});
