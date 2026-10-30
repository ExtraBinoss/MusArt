import { expect, it } from "vitest";
import * as renderer from "../src/index";
it("exposes renderer, pixel, export and lifecycle ports without importing React", () => {
  expect(Object.keys(renderer).sort()).toEqual(
    [
      "GpuEffects",
      "estimatePreviewCost",
      "gpuTextureLimit",
      "probeVideoOriginal",
      "MAX_FONT_BYTES",
      "createRenderSession",
      "createMotionPreview",
      "RENDER_CAPABILITIES",
      "GpuCompositor",
      "clearRenderCaches",
      "exportComposition",
      "exportMotionVideo",
      "MotionExportError",
      "probeAudioOriginal",
      "createMotionAudioMixer",
      "openMotionAudioSource",
      "renderComposition",
      "sourcePixels",
    ].sort(),
  );
});
