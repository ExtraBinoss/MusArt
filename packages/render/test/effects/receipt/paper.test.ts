import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { vec2 } from "three/tsl";
import { receiptPaper } from "../../../src/effects/receipt/paper";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { nodeFixture } from "../node-fixture";

it("keeps straight, torn and scalloped paper and fold/texture controls on a stable graph", () => {
  const f = nodeFixture("receipt"),
    effect = createEffect("receipt"),
    graph = receiptPaper(vec2(80, 90), f.controls),
    key = graph.getCacheKey();
  for (const edge of ["straight", "torn", "perforated"])
    for (const extreme of [false, true]) {
      updateEffectUniforms(
        f.controls,
        {
          ...effect,
          settings: {
            ...effect.settings,
            edge,
            edgeHeight: extreme ? 32 : 0,
            edgePitch: extreme ? 128 : 2,
            edgeSoftness: extreme ? 4 : 0.1,
            edgeJitter: extreme ? 1 : 0,
            foldWidth: extreme ? 64 : 0.5,
            fiberSize: extreme ? 16 : 0.25,
          },
        },
        320,
        240,
      );
      expect(graph.getCacheKey()).toBe(key);
    }
  expect(graph.isNode).toBe(true);
  f.dispose();
});
