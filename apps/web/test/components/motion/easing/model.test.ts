import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  createMotionEasingPreset,
  evaluateEasing,
  MOTION_EASING_PRESETS,
} from "@musart/core";
import {
  captureEasingOrigin,
  commitEasing,
  easingGraph,
  identifyEasing,
  sameEasing,
} from "../../../../src/components/motion/easing/model";

function fixture() {
  const layer = createLayer("rectangle");
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const target = { kind: "layer", layerId: layer.id, property: "x" } as const;
  engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: 0 },
    { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: 100 },
  ]);
  const page = engine.getSnapshot().project.pages[0]!,
    property = page.motion!.tracks[0]!.properties[0]!,
    key = property.keyframes[1]!;
  return { engine, page, property, key };
}

it("identifies canonical curves without duplicating interpolation semantics", () => {
  for (const preset of MOTION_EASING_PRESETS) {
    const easing = createMotionEasingPreset(preset),
      graph = easingGraph(easing);
    expect(identifyEasing(easing)).toBe(preset);
    expect(graph.points[40]!.y).toBe(evaluateEasing(0.5, easing));
    expect(graph.path).not.toMatch(/NaN|Infinity/);
  }
  expect(sameEasing(undefined, { type: "linear" })).toBe(true);
  expect(
    sameEasing({ type: "spring", bounce: 0.5 }, { type: "spring", bounce: 0.5, response: 12 }),
  ).toBe(true);
  expect(identifyEasing({ type: "spring", bounce: 0.5, response: 12 })).toBe("customSpring");
  expect(identifyEasing({ type: "cubicBezier", x1: 0.2, y1: 0, x2: 0.8, y2: 1 })).toBe(
    "customBezier",
  );
  const extreme = easingGraph({
    type: "cubicBezier",
    x1: 0,
    y1: Number.MAX_VALUE,
    x2: 1,
    y2: Number.MAX_VALUE,
  });
  expect(extreme.path).not.toMatch(/NaN|Infinity/);
  expect(Number.isFinite(extreme.toY(Number.MAX_VALUE))).toBe(true);
});

it("commits only changed incoming easing while preserving destination identity/time/value", () => {
  const d = fixture(),
    origin = captureEasingOrigin(d.engine, d.page.id, d.property.id, d.key.id),
    before = d.engine.getSnapshot();
  expect(commitEasing(d.engine, origin, { type: "linear" })).toBe("unchanged");
  expect(d.engine.getSnapshot()).toBe(before);
  expect(commitEasing(d.engine, origin, createMotionEasingPreset("bouncy"))).toBe("committed");
  const updated =
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[1]!;
  expect(updated).toMatchObject({
    id: d.key.id,
    time: d.key.time,
    value: d.key.value,
    easing: { type: "spring", bounce: 0.7, response: 14 },
  });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
});

it("rejects stale revision, missing targets and malformed curves atomically", () => {
  const d = fixture(),
    origin = captureEasingOrigin(d.engine, d.page.id, d.property.id, d.key.id);
  d.engine.execute({ type: "renameProject", name: "changed" });
  const before = d.engine.getSnapshot();
  expect(() => commitEasing(d.engine, origin, { type: "hold" })).toThrow();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(() => captureEasingOrigin(d.engine, "missing", d.property.id, d.key.id)).toThrow();
  expect(() => captureEasingOrigin(d.engine, d.page.id, "missing", d.key.id)).toThrow();
  expect(() => commitEasing(d.engine, origin, { type: "cubicBezier", x1: -1 } as never)).toThrow();
});
