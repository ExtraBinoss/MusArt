import { expect, test, vi } from "vitest";
import { createEffect, createLayer } from "@musart/core";
import { MorphResource, morphResourceKey, sourceMorph } from "../../../src/surface/morph/resource";
import { morphFixture } from "../../morph-fixture";
test("retains geometry through progress, strength and order changes and disposes each allocation once", () => {
  const effect = createEffect("morph", { shapeMorph: morphFixture() });
  const layer = createLayer("text", { text: "Type", effects: [effect] });
  const resource = new MorphResource(layer, effect, effect.shapeMorph!);
  const geometry = resource.geometry;
  const key = morphResourceKey(layer, effect);
  const changed = {
    ...effect,
    amount: 0.3,
    settings: { ...effect.settings, progress: 0.5, stagger: 0.6, order: "reverse" },
  };
  expect(morphResourceKey(layer, changed)).toBe(key);
  resource.update(layer, changed);
  expect(resource.geometry).toBe(geometry);
  expect(resource.progress.value).toBe(0.5);
  expect(resource.amount.value).toBe(0.3);
  expect(resource.order.value).toBe(1);
  expect(resource.matchesLayout({ ...layer, effects: [changed] })).toBe(true);
  expect(resource.matchesLayout({ ...layer, text: "Other" })).toBe(false);
  expect(sourceMorph({ ...layer, text: "  " })).toBeUndefined();
  const disposals = [resource.geometry, resource.material, resource.atlas.texture].map((item) =>
    vi.spyOn(item, "dispose"),
  );
  resource.dispose();
  resource.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  expect(resource.scene.children).toHaveLength(0);
});
