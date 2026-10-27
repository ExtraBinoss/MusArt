import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG } from "@musart/core";
import { EFFECT_NODES } from "../../src/effects/registry";
import { nodeFixture, expectSourceAlpha } from "./node-fixture";
describe("effect implementation registry", () => {
  it("implements every core catalogue type without a central type switch", () => {
    expect(Object.keys(EFFECT_NODES)).toEqual(Object.keys(EFFECT_CATALOG));
    expect(Object.isFrozen(EFFECT_NODES)).toBe(true);
    for (const type of Object.keys(EFFECT_CATALOG) as Array<keyof typeof EFFECT_CATALOG>) {
      const fixture = nodeFixture(type);
      expectSourceAlpha(EFFECT_NODES[type](fixture), fixture.input);
      fixture.dispose();
    }
  });
});
