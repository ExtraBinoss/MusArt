import { expect, it } from "vitest";
import {
  createProject,
  createPage,
  createLayer,
  EditorEngine,
} from "../../../packages/core/src/index";
import { parseHeadlessTime, evaluateHeadlessMotion } from "../../../scripts/headless/motion";

it("parses exact decimal/fractional seconds and rejects invalid or unsafe CLI time", () => {
  expect(parseHeadlessTime("15/30")).toEqual({ value: 1, rate: 2 });
  expect(parseHeadlessTime("-0.125")).toEqual({ value: -1, rate: 8 });
  expect(parseHeadlessTime("1.030000000")).toEqual({ value: 103, rate: 100 });
  for (const text of [
    "NaN",
    "Infinity",
    "0/0",
    "1/-1",
    "1e3",
    "0.0000000001",
    "1/0",
    "9007199254740993",
  ])
    expect(() => parseHeadlessTime(text)).toThrow();
});

it("evaluates a selected artboard using the same generic commands without changing the project", () => {
  const first = createPage({ id: "first" });
  const second = createPage({ id: "second", layers: [createLayer("rectangle", { id: "hero" })] });
  const engine = new EditorEngine(createProject({ pages: [first, second] }));
  engine.setPage("second");
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const target = { kind: "layer", layerId: "hero", property: "x" } as const;
  engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: 0 },
    { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: 100 },
  ]);
  const before = engine.getSnapshot();
  const report = evaluateHeadlessMotion(before.project, "second", "15/30");
  expect(report.composition.layers[0]!.x).toBe(50);
  expect(report.values).toEqual([{ target, value: 50 }]);
  expect(engine.getSnapshot()).toBe(before);
  expect(() => evaluateHeadlessMotion(before.project, "missing", "0")).toThrow();
});
