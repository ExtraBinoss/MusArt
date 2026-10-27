import { expect, it } from "vitest";
import { createEffect, GRADIENT_TREATMENTS } from "@musart/core";
import { gradientStages } from "../../../src/effects/gradient/pipeline";
it("orders field, optional genuine treatment and finishing with exactly one compositing boundary", () => {
  for (const treatment of GRADIENT_TREATMENTS) {
    const stages = gradientStages(createEffect("gradient", { settings: { treatment } }));
    expect(stages[0]?.key).toBe("gradient:field");
    expect(stages.at(-1)?.key).toBe("gradient:finish");
    expect(stages.filter((stage) => stage.final)).toHaveLength(1);
    expect(stages.length).toBe(treatment === "none" ? 2 : 3);
    if (treatment !== "none")
      expect(stages[1]).toMatchObject({ key: `gradient:${treatment}`, treatment: true });
  }
});
