import { expect, it } from "vitest";
import { SHAPES } from "../../../../src/ui/brand/engine/skins";
import { decalageDesYeux, POUR_TESTS } from "../../../../src/ui/brand/engine/eyefit";
import { EXPRESSIONS } from "../../../../src/ui/brand/engine/expressions";
import EYE_FIT_DATA from "../../../../src/ui/brand/engine/eye-fit-data";

it("precomputed eye fits match the original solver for every built-in pose", () => {
  const solved = POUR_TESTS.batir();
  const expected = Object.fromEntries(
    SHAPES.map((shape) => [shape.id, Object.fromEntries(solved.get(shape.radii)!)]),
  );
  expect(EYE_FIT_DATA).toEqual(expected);
  expect(solved.size).toBe(SHAPES.length);
  for (const shape of SHAPES) {
    for (const expression of EXPRESSIONS) {
      expect(solved.get(shape.radii)?.get(`idle|${expression.id}`)).toEqual(
        decalageDesYeux(shape.radii, "idle", expression.id),
      );
    }
  }
});
