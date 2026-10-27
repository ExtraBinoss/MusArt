import { expect, it } from "vitest";
import * as renderer from "../src/index";
it("exposes renderer, pixel, export and lifecycle ports without importing React", () => {
  expect(Object.keys(renderer).sort()).toEqual(
    [
      "GpuEffects",
      "GpuCompositor",
      "clearRenderCaches",
      "exportComposition",
      "renderComposition",
      "sourcePixels",
    ].sort(),
  );
});
