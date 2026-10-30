import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  captureTransformAuthoring,
  isTransformAuthoringCurrent,
  transformAuthoringCommands,
  watchTransformAuthoring,
  type TransformAuthoring,
} from "../../../src/canvas/interaction/transform-authoring";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { getMotionAuthoring } from "../../../src/state/session/motion-authoring";
import { motionPropertyTrack } from "../../../src/state/session/motion-edit";
import { motionPoseFixture } from "../../support/motion-pose";

test("a keyed resize commits the displayed value at the captured time with unchanged base and one undo", () => {
  const d = motionPoseFixture();
  const layer = d.index.get(d.picture.id);
  const active = { ...captureTransformAuthoring(d.engine), layers: [layer] };
  const before = d.engine.getSnapshot();
  const commands = transformAuthoringCommands(d.engine, active, [
    { layerId: layer.id, patch: { width: layer.width + 10, height: layer.height } },
  ]);
  expect(commands).toHaveLength(1);
  d.engine.transaction(commands);
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers.find((item) => item.id === layer.id)!.width).toBe(d.picture.width);
  expect(
    motionPropertyTrack(page, {
      kind: "layer",
      layerId: layer.id,
      property: "width",
    })!.keyframes.map((key) => key.value),
  ).toEqual([30, 55, 60]);
  expect(d.transport.readFrame()!.layers.find((item) => item.id === layer.id)!.width).toBe(55);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  d.engine.redo();
  expect(d.transport.readFrame()!.layers.find((item) => item.id === layer.id)!.width).toBe(55);
});

test("one multi-layer move mixes a keyed parent and an unkeyed child without changing authored base values", () => {
  const d = motionPoseFixture();
  const group = d.index.get(d.group.id),
    movie = d.index.get(d.movie.id);
  const active = { ...captureTransformAuthoring(d.engine), layers: [group, movie] };
  const before = d.engine.getSnapshot();
  d.engine.transaction(
    transformAuthoringCommands(d.engine, active, [
      { layerId: group.id, patch: { x: group.x + 10 } },
      { layerId: movie.id, patch: { x: movie.x + 5 } },
    ]),
  );
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers.find((item) => item.id === group.id)!.x).toBe(d.group.x);
  expect(page.layers.find((item) => item.id === movie.id)!.x).toBe(movie.x + 5);
  expect(d.transport.readFrame()!.layers.find((item) => item.id === group.id)!.x).toBe(
    group.x + 10,
  );
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before.project);
});

test("a keyed rotation writes the captured-time pose while retaining its base rotation", () => {
  const d = motionPoseFixture(),
    layer = d.index.get(d.picture.id);
  const active = { ...captureTransformAuthoring(d.engine), layers: [layer] };
  d.engine.transaction(
    transformAuthoringCommands(d.engine, active, [
      { layerId: layer.id, patch: { rotation: layer.rotation + 15 } },
    ]),
  );
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === layer.id)!.rotation,
  ).toBe(d.picture.rotation);
  expect(d.transport.readFrame()!.layers.find((item) => item.id === layer.id)!.rotation).toBe(
    layer.rotation + 15,
  );
});

test("Static retains base edits and Auto-key is captured once for an unkeyed Motion property", () => {
  const d = motionPoseFixture();
  getMotionAuthoring(d.engine).set(true);
  const active = { ...captureTransformAuthoring(d.engine), layers: [d.index.get(d.movie.id)] };
  getMotionAuthoring(d.engine).set(false);
  d.engine.transaction(
    transformAuthoringCommands(d.engine, active, [
      { layerId: d.movie.id, patch: { rotation: 25 } },
    ]),
  );
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === d.movie.id)!
      .rotation,
  ).toBe(0);
  expect(d.transport.readFrame()!.layers.find((item) => item.id === d.movie.id)!.rotation).toBe(25);
  d.engine.execute({ type: "setCompositionMode", mode: "static" });
  const base = d.engine
    .getSnapshot()
    .project.pages[0]!.layers.find((item) => item.id === d.movie.id)!;
  d.engine.transaction(
    transformAuthoringCommands(
      d.engine,
      { ...captureTransformAuthoring(d.engine), layers: [base] },
      [{ layerId: base.id, patch: { rotation: 35 } }],
    ),
  );
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === base.id)!.rotation,
  ).toBe(35);
});

test("a zero-delta pose adds no key or undo entry and unknown preview targets cannot commit", () => {
  const d = motionPoseFixture(),
    layer = d.index.get(d.picture.id);
  const active = { ...captureTransformAuthoring(d.engine), layers: [layer] };
  const before = d.engine.getSnapshot();
  expect(
    transformAuthoringCommands(d.engine, active, [
      { layerId: layer.id, patch: { width: layer.width + 1e-12, height: layer.height } },
      { layerId: "missing", patch: { x: 40 } },
    ]),
  ).toEqual([]);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(
    transformAuthoringCommands(d.engine, { origin: active.origin, layers: [layer] }, [
      { layerId: layer.id, patch: { width: 80 } },
    ]),
  ).toEqual([]);
});

test.each(["seek", "revision", "project", "page"] as const)(
  "%s invalidates a captured transform, including constant poses, and releases subscriptions",
  (change) => {
    const layer = createLayer("rectangle"),
      a = createPage({ layers: [layer] }),
      b = createPage();
    const engine = new EditorEngine(createProject({ pages: [a, b] }));
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const origin = captureTransformAuthoring(engine);
    let held: TransformAuthoring | null = origin;
    const cancel = vi.fn(() => {
      held = null;
    });
    const stop = watchTransformAuthoring(engine, () => held, cancel);
    engine.select([layer.id]);
    expect(cancel).not.toHaveBeenCalled();
    if (change === "seek") createMotionTransport(engine).seek({ value: 1, rate: 1 });
    else if (change === "revision") engine.execute({ type: "renameProject", name: "Changed" });
    else if (change === "project") engine.load(structuredClone(engine.getSnapshot().project));
    else engine.setPage(b.id);
    expect(cancel).toHaveBeenCalledOnce();
    expect(isTransformAuthoringCurrent(engine, origin)).toBe(false);
    expect(
      transformAuthoringCommands(engine, { ...origin, layers: [layer] }, [
        { layerId: layer.id, patch: { width: 80 } },
      ]),
    ).toEqual([]);
    stop();
    held = captureTransformAuthoring(engine);
    engine.execute({ type: "renameProject", name: "After cleanup" });
    expect(cancel).toHaveBeenCalledOnce();
  },
);
