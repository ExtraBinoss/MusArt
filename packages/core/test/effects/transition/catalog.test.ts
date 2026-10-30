import { expect, it } from "vitest";
import {
  TRANSITION_CATALOG,
  TRANSITION_CATEGORIES,
  getTransitionDefinition,
} from "../../../src/effects/transition/catalog";

it("exposes thirty distinct immutable operators with discoverable categories", () => {
  expect(TRANSITION_CATALOG).toHaveLength(30);
  expect(new Set(TRANSITION_CATALOG.map(({ id }) => id)).size).toBe(30);
  expect(TRANSITION_CATEGORIES).toEqual(["fade", "reveal", "move", "distort", "stylize"]);
  for (const definition of TRANSITION_CATALOG) {
    expect(getTransitionDefinition(definition.id)).toBe(definition);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(definition.labelKey).toContain(definition.id);
  }
  expect(Object.isFrozen(TRANSITION_CATALOG)).toBe(true);
  expect(getTransitionDefinition("__proto__")).toBeUndefined();
  expect(getTransitionDefinition(1)).toBeUndefined();
});
