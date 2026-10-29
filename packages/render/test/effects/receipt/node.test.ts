import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { receiptNode } from "../../../src/effects/receipt/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { graphNodes, nodeFixture } from "../node-fixture";

it("retains source ownership and stable controls across paper modes, colors and cutout", () => {
  const f = nodeFixture("receipt"),
    effect = createEffect("receipt"),
    graph = receiptNode(f),
    key = graph.getCacheKey(),
    parameters = { ...f.controls.parameters },
    colors = { ...f.controls.colors };
  updateEffectUniforms(
    f.controls,
    {
      ...effect,
      amount: 0.5,
      settings: {
        ...effect.settings,
        cutout: true,
        edge: "perforated",
        mode: "threshold",
        paperColor: "#ffcccc",
        inkColor: "#112255",
      },
    },
    320,
    240,
  );
  expect(graph.getCacheKey()).toBe(key);
  for (const [name, value] of Object.entries(parameters))
    expect(f.controls.parameters[name]).toBe(value);
  for (const [name, value] of Object.entries(colors)) expect(f.controls.colors[name]).toBe(value);
  expect(f.controls.parameters.cutout!.value).toBe(1);
  expect(graphNodes(graph).has(f.source)).toBe(true);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
