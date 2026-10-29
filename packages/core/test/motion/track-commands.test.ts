import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "../../src/index";

function setup() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "group" }),
            createLayer("rectangle", { id: "child", parentId: "group" }),
            createLayer("ellipse", { id: "other" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const target = { kind: "layer", layerId: "child", property: "x" } as const;
  engine.transaction(
    [0, 1, 2].map((value) => ({
      type: "upsertMotionKeyframe",
      target,
      time: { value, rate: 1 },
      value: value * 100,
    })),
  );
  return { engine, page: () => engine.getSnapshot().project.pages[0]! };
}

it("moves a group's placement, descendants and keys without shortening unaffected tracks", () => {
  const { engine, page } = setup();
  const before = engine.getSnapshot();
  const id = page().motion!.tracks[0]!.id;
  engine.execute({ type: "moveMotionTrack", trackId: id, delta: { value: 2, rate: 1 } });
  expect(page().motion!.duration).toEqual({ value: 4, rate: 1 });
  expect(
    page()
      .motion!.tracks.slice(0, 2)
      .map((track) => [track.start.value, track.end?.value]),
  ).toEqual([
    [2, 4],
    [2, 4],
  ]);
  expect(page().motion!.tracks[1]!.properties[0]!.keyframes.map((key) => key.time.value)).toEqual([
    2, 3, 4,
  ]);
  expect(page().motion!.tracks[2]!.end).toBeNull();
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  engine.redo();
  expect(page().motion!.duration.value).toBe(4);
});

it("moves selected keys atomically, rejecting collisions, missing IDs and negative times", () => {
  const { engine, page } = setup();
  const keys = () => page().motion!.tracks[1]!.properties[0]!.keyframes;
  const first = keys()[0]!.id,
    second = keys()[1]!.id;
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "moveMotionKeyframes",
      keyframeIds: [first],
      delta: { value: 1, rate: 1 },
    }),
  ).toThrow("occupied");
  expect(() =>
    engine.execute({
      type: "moveMotionKeyframes",
      keyframeIds: [first, "missing"],
      delta: { value: 1, rate: 10 },
    }),
  ).toThrow("not found");
  expect(() =>
    engine.execute({
      type: "moveMotionKeyframes",
      keyframeIds: [first, first],
      delta: { value: 1, rate: 10 },
    }),
  ).toThrow("Duplicate");
  expect(() =>
    engine.execute({
      type: "moveMotionKeyframes",
      keyframeIds: [first],
      delta: { value: -1, rate: 1 },
    }),
  ).toThrow("Negative");
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({
    type: "moveMotionKeyframes",
    keyframeIds: [first, second],
    delta: { value: 1, rate: 2 },
  });
  expect(keys().map((key) => key.time)).toEqual([
    { value: 1, rate: 2 },
    { value: 3, rate: 2 },
    { value: 2, rate: 1 },
  ]);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});

it("rejects a track move which would destroy pre-zero keys", () => {
  const { engine, page } = setup();
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "moveMotionTrack",
      trackId: page().motion!.tracks[0]!.id,
      delta: { value: -1, rate: 1 },
    }),
  ).toThrow("before zero");
  expect(engine.getSnapshot()).toBe(before);
});

it("deletes a key selection in one transaction and rolls back missing/duplicate identities", () => {
  const { engine, page } = setup();
  const keys = page().motion!.tracks[1]!.properties[0]!.keyframes;
  const ids = [keys[0]!.id, keys[2]!.id];
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({ type: "deleteMotionKeyframes", keyframeIds: [ids[0]!, "missing"] }),
  ).toThrow("not found");
  expect(() =>
    engine.execute({ type: "deleteMotionKeyframes", keyframeIds: [ids[0]!, ids[0]!] }),
  ).toThrow("Duplicate");
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "deleteMotionKeyframes", keyframeIds: ids });
  expect(page().motion!.tracks[1]!.properties[0]!.keyframes.map((key) => key.value)).toEqual([100]);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});
