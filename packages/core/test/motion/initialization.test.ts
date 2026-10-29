import { expect, it } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createLayer, createProject, createPage } from "../../src/document/factories";
import { planMotionInitialization } from "../../src/motion/initialization";

it("plans without modifying the base and owns its temporal settings", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "group" }),
            createLayer("rectangle", { id: "child", parentId: "group" }),
          ],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot();
  const duration = { value: 3, rate: 1 };
  const plan = planMotionInitialization(before, duration, { numerator: 30000, denominator: 1001 });
  duration.value = 99;
  expect(plan.duration.value).toBe(3);
  expect(plan.layerIds).toEqual(["child", "group"]);
  expect(plan.frameRate).toEqual({ numerator: 30000, denominator: 1001 });
  expect(engine.getSnapshot()).toBe(before);
  expect(() => planMotionInitialization(before, { value: -1, rate: 1 })).toThrow();
  expect(() => planMotionInitialization(before, { value: 1, rate: 0 })).toThrow();
  expect(() => planMotionInitialization({ ...before, pageId: "missing" })).toThrow();
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  expect(() => planMotionInitialization(engine.getSnapshot())).toThrow("already initialized");
});
