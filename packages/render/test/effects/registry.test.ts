import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG, getEffectDefinition } from "@musart/core";
import { TextureNode } from "three/webgpu";
import { EFFECT_NODES } from "../../src/effects/registry";
import { nodeFixture, expectSourceAlpha, graphNodes } from "./node-fixture";
describe("effect implementation registry", () => {
  it("implements every core catalogue type without a central type switch", () => {
    expect(Object.keys(EFFECT_NODES).sort()).toEqual(
      Object.keys(EFFECT_CATALOG)
        .filter((type) => type !== "gradient" && type !== "transition")
        .sort(),
    );
    expect(Object.isFrozen(EFFECT_NODES)).toBe(true);
    for (const type of Object.keys(EFFECT_NODES) as Array<keyof typeof EFFECT_NODES>) {
      const fixture = nodeFixture(type);
      const node = EFFECT_NODES[type](fixture);
      expect(node.isNode).toBe(true);
      if (getEffectDefinition(type).coverage === "preserve") expectSourceAlpha(node, fixture.input);
      else {
        // Reducible coverage is intentional (ink opacity/cuts), with native
        // default-alpha and cutout witnesses in each effect's browser spec.
        expect(
          [...graphNodes(node)].some(
            (child) => child instanceof TextureNode && child.value === fixture.input,
          ),
        ).toBe(true);
      }
      fixture.dispose();
    }
  });
});
