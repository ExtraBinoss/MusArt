import { expect, it } from "vitest";
import { evaluateMotion } from "@musart/core";
import { createTransitionPreviewDocument } from "../../../../src/components/motion/transitions/preview-document";

it("authors real isolated transition keys for enter and exit without embedded media", () => {
  for (const placement of ["in", "out"] as const) {
    const program = createTransitionPreviewDocument("wipe", placement, 800);
    expect(program.composition).toMatchObject({ width: 192, height: 112 });
    expect(program.composition.layers[0]!.effects[0]).toMatchObject({
      type: "transition",
      settings: { style: "wipe" },
    });
    expect(program.duration).toEqual({ value: 800, rate: 1000 });
    const progress = (value: number) =>
      evaluateMotion(program, { value, rate: 1000 }, { terminalPreview: true }).values.find(
        (entry) => entry.target.kind === "effectSetting" && entry.target.property === "progress",
      )!.value;
    expect(progress(0)).toBe(placement === "in" ? 0 : 1);
    expect(progress(800)).toBe(placement === "in" ? 1 : 0);
    expect(program.audio).toEqual([]);
  }
});
it("keeps successive choices independent and rejects invalid duration instead of a fake preview", () => {
  const first = createTransitionPreviewDocument("fade", "in", 500);
  createTransitionPreviewDocument("glitch", "out", 500);
  expect(first.composition.layers[0]!.effects[0]!.settings).toMatchObject({ style: "fade" });
  for (const duration of [0, NaN, Infinity, 0.5])
    expect(() => createTransitionPreviewDocument("fade", "in", duration)).toThrow("duration");
});
