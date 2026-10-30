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
it("moves every v2 group descendant and its keys together, keeping parent siblings and unrelated tracks independent", () => {
  const t = (value: number) => ({ value, rate: 1 });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "parent" }),
            createLayer("group", { id: "nested", parentId: "parent" }),
            createLayer("rectangle", { id: "child", parentId: "nested" }),
            createLayer("ellipse", { id: "other" }),
          ],
          motion: {
            version: 2,
            mode: "motion",
            initialized: true,
            duration: t(8),
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [
              { id: "parent-a", layerId: "parent", start: t(1), end: t(3), properties: [] },
              { id: "parent-b", layerId: "parent", start: t(6), end: t(8), properties: [] },
              { id: "nested-track", layerId: "nested", start: t(1), end: t(4), properties: [] },
              {
                id: "child-a",
                layerId: "child",
                start: t(1),
                end: t(2),
                properties: [
                  {
                    id: "x",
                    target: { kind: "layer", layerId: "child", property: "x" },
                    keyframes: [
                      { id: "preroll", time: t(-1), value: 0 },
                      { id: "pose", time: t(1), value: 100 },
                    ],
                  },
                ],
              },
              { id: "child-b", layerId: "child", start: t(4), end: t(5), properties: [] },
              { id: "unrelated", layerId: "other", start: t(0), end: null, properties: [] },
            ],
          },
        }),
      ],
    }),
  );
  const before = engine.getSnapshot().project;
  engine.transaction([{ type: "moveMotionTrack", trackId: "parent-a", delta: t(1) }]);
  const motion = engine.getSnapshot().project.pages[0]!.motion!;
  expect(
    motion.tracks.map((track) => [track.id, track.start.value, track.end?.value ?? null]),
  ).toEqual([
    ["parent-a", 2, 4],
    ["parent-b", 6, 8],
    ["nested-track", 2, 5],
    ["child-a", 2, 3],
    ["child-b", 5, 6],
    ["unrelated", 0, null],
  ]);
  expect(motion.tracks[3]!.properties[0]!.keyframes.map((key) => key.time.value)).toEqual([0, 2]);
  expect(motion.duration).toEqual(t(8));
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.motion!.tracks[3]!.start).toEqual(t(2));
});
it("keeps explicit v2 API extension available and rolls back a negative grouped interval atomically", () => {
  const { engine, page } = setup();
  const first = page().motion!.tracks[0]!.id;
  engine.execute({
    type: "addMotionOccurrence",
    layerId: "other",
    start: { value: 3, rate: 1 },
    end: { value: 4, rate: 1 },
  });
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({ type: "moveMotionTrack", trackId: first, delta: { value: -1, rate: 1 } }),
  ).toThrow("before zero");
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "moveMotionTrack", trackId: first, delta: { value: 2, rate: 1 } });
  expect(page().motion!.duration).toEqual({ value: 6, rate: 1 });
  expect(page().motion!.tracks.find((track) => track.layerId === "child")!.start).toEqual({
    value: 2,
    rate: 1,
  });
});
