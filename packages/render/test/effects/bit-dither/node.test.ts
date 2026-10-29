import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { bitDitherNode } from "../../../src/effects/bit-dither/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, nodeFixture } from "../node-fixture";

it("retains original per-pixel alpha and stable method/palette uniforms through live edits", () => {
  const fixture = nodeFixture("bit-dither"),
    node = bitDitherNode(fixture),
    key = node.getCacheKey(),
    method = fixture.controls.parameters.method,
    foreground = fixture.controls.colors.foreground;
  expectSourceAlpha(node, fixture.input);
  for (const [index, name] of [
    "threshold",
    "bayer2",
    "bayer4",
    "bayer8",
    "interleaved",
  ].entries()) {
    updateEffectUniforms(
      fixture.controls,
      createEffect("bit-dither", {
        scale: 8,
        seed: 2147483647,
        settings: {
          method: name,
          threshold: 0.75,
          strength: 0.5,
          invert: true,
          foreground: "#36114d",
          background: "#f3eec0",
        },
      }),
      120,
      80,
      { width: 960, height: 640 },
    );
    expect(node.getCacheKey()).toBe(key);
    expect(fixture.controls.parameters.method).toBe(method);
    expect(method!.value).toBe(index);
    expect(fixture.controls.colors.foreground).toBe(foreground);
    expect(fixture.controls.parameters.invert!.value).toBe(1);
    expect(fixture.controls.logicalResolution.value.toArray()).toEqual([960, 640]);
  }
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
