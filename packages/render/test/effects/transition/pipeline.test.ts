import { expect, it } from "vitest";
import { createEffect, TRANSITION_CATALOG } from "@musart/core";
import { transitionStages } from "../../../src/effects/transition/pipeline";
import { nodeFixture } from "../node-fixture";
it("selects exactly one reusable pass per style and never replaces it for numeric animation", () => {
  const f = nodeFixture("transition");
  for (const { id } of TRANSITION_CATALOG) {
    const stages = transitionStages(
      createEffect("transition", { settings: { style: id, progress: 0 } }),
    );
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({ key: `transition:${id}`, final: true });
    expect(stages[0]!.builder(f).isNode).toBe(true);
    expect(Object.isFrozen(stages)).toBe(true);
    expect(
      transitionStages(createEffect("transition", { settings: { style: id, progress: 0.75 } })),
    ).toBe(stages);
  }
  expect(() =>
    transitionStages({ ...createEffect("transition"), settings: { style: "toString" } }),
  ).toThrow("Unknown transition");
  f.dispose();
});
