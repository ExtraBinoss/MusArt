import { expect, it } from "vitest";
import { TRANSITION_CATALOG } from "@musart/core";
import { TRANSITION_OPERATORS } from "../../../src/effects/transition/registry";
it("implements every portable operator exactly once without aliases or inherited dispatch entries", () => {
  expect(Object.keys(TRANSITION_OPERATORS).sort()).toEqual(
    TRANSITION_CATALOG.map(({ id }) => id).sort(),
  );
  expect(new Set(Object.values(TRANSITION_OPERATORS)).size).toBe(30);
  expect(Object.isFrozen(TRANSITION_OPERATORS)).toBe(true);
  expect(Object.hasOwn(TRANSITION_OPERATORS, "toString")).toBe(false);
});
