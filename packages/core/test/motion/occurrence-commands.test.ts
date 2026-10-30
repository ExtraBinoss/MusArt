import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import { parseProject, serializeProject } from "../../src/document/serialization";
import { compileMotion } from "../../src/motion/compile";
import { evaluateMotion } from "../../src/motion/evaluate";
import { applyMotionFrame } from "../../src/motion/frame";
import { listLayerMotionOccurrences } from "../../src/motion/occurrences";
import { video } from "../assets/fixtures";
const t = (value: number, rate = 1) => ({ value, rate });
const target = { kind: "layer", layerId: "hero", property: "x" } as const;
function fixture() {
  const asset = video();
  const engine = new EditorEngine(
    createProject({
      assets: { [asset.id]: asset },
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", {
              id: "hero",
              effects: [createEffect("grain", { id: "grain" })],
            }),
            createLayer("video", { id: "clip", assetId: asset.id }),
            createLayer("ellipse", { id: "other" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const occurrences = (id = "hero") => listLayerMotionOccurrences(page(), id);
  engine.transaction([
    { type: "upsertMotionKeyframe", target, time: t(0), value: 0 },
    { type: "upsertMotionKeyframe", target, time: t(2), value: 200, easing: { type: "hold" } },
  ]);
  return { engine, page, occurrences };
}
test("duplicates one occurrence and its independent keys without creating visual layers", () => {
  const { engine, page, occurrences } = fixture();
  const first = occurrences()[0]!;
  const before = engine.getSnapshot();
  engine.execute({ type: "duplicateMotionOccurrence", trackId: first.id, start: t(3) });
  const [original, copy] = occurrences();
  expect(page().motion!.version).toBe(2);
  expect(page().layers).toEqual(before.project.pages[0]!.layers);
  expect(original!.end).toEqual(t(2));
  expect([copy!.start, copy!.end, page().motion!.duration]).toEqual([t(3), t(5), t(5)]);
  expect(copy!.properties[0]!.keyframes.map((key) => key.time)).toEqual([t(3), t(5)]);
  expect(copy!.properties[0]!.keyframes[1]!.easing).toEqual({ type: "hold" });
  const originalIds = new Set([
    first.id,
    ...first.properties.flatMap((property) => [
      property.id,
      ...property.keyframes.map((key) => key.id),
    ]),
  ]);
  expect(
    [
      copy!.id,
      ...copy!.properties.flatMap((property) => [
        property.id,
        ...property.keyframes.map((key) => key.id),
      ]),
    ].every((id) => !originalIds.has(id)),
  ).toBe(true);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  engine.redo();
  engine.execute({
    type: "upsertMotionKeyframe",
    trackId: copy!.id,
    target,
    time: t(3),
    value: 999,
  });
  expect(occurrences()[0]!.properties[0]!.keyframes[0]!.value).toBe(0);
  expect(occurrences()[1]!.properties[0]!.keyframes[0]!.value).toBe(999);
  expect(parseProject(serializeProject(engine.getSnapshot().project))).toEqual(
    engine.getSnapshot().project,
  );
});
test("rejects overlaps and ambiguous edits atomically, allowing adjacent rational placement", () => {
  const { engine, occurrences } = fixture();
  const id = occurrences()[0]!.id;
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({ type: "duplicateMotionOccurrence", trackId: id, start: t(1) }),
  ).toThrow("overlap");
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "duplicateMotionOccurrence", trackId: id, start: t(6, 3) });
  const copy = occurrences()[1]!;
  expect(() =>
    engine.execute({ type: "upsertMotionKeyframe", target, time: t(10), value: 5 }),
  ).toThrow("Choose a Motion occurrence");
  const current = engine.getSnapshot();
  expect(() => engine.execute({ type: "moveMotionTrack", trackId: copy.id, delta: t(-1) })).toThrow(
    "overlap",
  );
  expect(engine.getSnapshot()).toBe(current);
  expect(() =>
    engine.execute({ type: "setMotionTrackRange", trackId: copy.id, start: t(1), end: t(4) }),
  ).toThrow("overlap");
  expect(engine.getSnapshot()).toBe(current);
  engine.execute({ type: "upsertMotionKeyframe", target, time: t(3), value: 55 });
  expect(occurrences()[1]!.properties[0]!.keyframes.some((key) => key.value === 55)).toBe(true);
});
test("deleting the last v2 occurrence preserves Static base and allows adding it again", () => {
  const { engine, page, occurrences } = fixture();
  const before = engine.getSnapshot();
  engine.execute({ type: "deleteMotionOccurrence", trackId: occurrences()[0]!.id });
  const frame = evaluateMotion(
    compileMotion(engine.getSnapshot().project, { compositionId: page().id }),
    t(1),
  );
  expect(frame.activeLayerIds).not.toContain("hero");
  expect(page().layers.find((layer) => layer.id === "hero")!.x).toBe(80);
  engine.execute({ type: "setCompositionMode", mode: "static" });
  const staticProgram = compileMotion(engine.getSnapshot().project, { compositionId: page().id });
  expect(
    applyMotionFrame(staticProgram, evaluateMotion(staticProgram, t(1))).layers.find(
      (layer) => layer.id === "hero",
    )!.visible,
  ).toBe(true);
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  expect(occurrences()).toEqual([]);
  engine.execute({ type: "addMotionOccurrence", layerId: "hero", start: t(1, 3), end: t(5, 3) });
  expect(occurrences()).toHaveLength(1);
  expect(page().layers).toEqual(before.project.pages[0]!.layers);
});
test("video copies and moves retain source in-point; trims change only their own source alignment", () => {
  const { engine, occurrences, page } = fixture();
  const id = occurrences("clip")[0]!.id;
  engine.execute({ type: "setMotionTrackRange", trackId: id, start: t(1), end: t(2) });
  engine.execute({ type: "duplicateMotionOccurrence", trackId: id, start: t(3) });
  const copy = occurrences("clip")[1]!;
  expect(copy.media!.sourceIn).toEqual(t(1));
  engine.execute({ type: "moveMotionTrack", trackId: copy.id, delta: t(1) });
  expect(occurrences("clip")[1]!.media!.sourceIn).toEqual(t(1));
  engine.execute({ type: "setMotionTrackRange", trackId: copy.id, start: t(9, 2), end: t(5) });
  expect(occurrences("clip").map((track) => track.media!.sourceIn)).toEqual([t(1), t(3, 2)]);
  const plan = evaluateMotion(
    compileMotion(engine.getSnapshot().project, { compositionId: page().id }),
    t(19, 4),
  );
  expect(plan.mediaRequests[0]!.sourceTime).toEqual(t(5, 4));
});
test("canonical layer duplicate/delete and effect pruning preserve every occurrence's identities", () => {
  const { engine, occurrences, page } = fixture();
  engine.execute({ type: "duplicateMotionOccurrence", trackId: occurrences()[0]!.id, start: t(3) });
  engine.execute({ type: "duplicateLayers", ids: ["hero"] });
  const duplicate = page().layers.find(
    (layer) => layer.kind === "rectangle" && layer.id !== "hero",
  )!;
  expect(listLayerMotionOccurrences(page(), duplicate.id)).toHaveLength(2);
  for (const track of listLayerMotionOccurrences(page(), duplicate.id))
    expect(track.properties[0]!.target.layerId).toBe(duplicate.id);
  engine.execute({ type: "deleteLayers", ids: ["hero"] });
  expect(occurrences()).toEqual([]);
  expect(listLayerMotionOccurrences(page(), duplicate.id)).toHaveLength(2);
});
test("promotion materializes legacy implicit layers once and undo restores the v1 document", () => {
  const { engine, occurrences } = fixture();
  const project = structuredClone(engine.getSnapshot().project);
  project.pages[0]!.motion!.tracks = [project.pages[0]!.motion!.tracks[0]!];
  engine.load(project);
  const before = engine.getSnapshot();
  const activeBefore = evaluateMotion(
    compileMotion(project, { compositionId: "page" }),
    t(1),
  ).activeLayerIds;
  engine.execute({ type: "duplicateMotionOccurrence", trackId: occurrences()[0]!.id, start: t(3) });
  const current = engine.getSnapshot().project;
  expect(
    evaluateMotion(compileMotion(current, { compositionId: "page" }), t(1)).activeLayerIds,
  ).toEqual(activeBefore);
  expect(current.pages[0]!.motion!.tracks.map((track) => track.layerId)).toEqual([
    "hero",
    "clip",
    "other",
    "hero",
  ]);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});
test("a v2 group occurrence move preserves child placement and rejects locked visual edits", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "parent" }),
            createLayer("rectangle", { id: "child", parentId: "parent" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const group = page().motion!.tracks[0]!;
  engine.execute({ type: "duplicateMotionOccurrence", trackId: group.id, start: t(3) });
  const copy = listLayerMotionOccurrences(page(), "parent")[1]!;
  const child = structuredClone(listLayerMotionOccurrences(page(), "child")[0]!);
  engine.execute({ type: "moveMotionTrack", trackId: copy.id, delta: t(1) });
  expect(listLayerMotionOccurrences(page(), "child")[0]).toEqual(child);
  engine.execute({ type: "updateLayers", ids: ["parent"], patch: { locked: true } });
  const before = engine.getSnapshot();
  expect(() => engine.execute({ type: "deleteMotionOccurrence", trackId: copy.id })).toThrow();
  expect(() =>
    engine.execute({ type: "addMotionOccurrence", layerId: "child", start: t(7), end: t(8) }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
});
test("canonical effect deletion prunes each occurrence while retaining unrelated channels and undo", () => {
  const { engine, page, occurrences } = fixture();
  const original = occurrences()[0]!;
  engine.execute({
    type: "upsertMotionKeyframe",
    trackId: original.id,
    target: { kind: "effect", layerId: "hero", effectId: "grain", property: "amount" },
    time: t(0),
    value: 0.5,
  });
  engine.execute({ type: "duplicateMotionOccurrence", trackId: original.id, start: t(3) });
  const before = engine.getSnapshot();
  engine.execute({ type: "updateLayers", ids: ["hero"], patch: { effects: [] } });
  expect(
    occurrences().every(
      (track) => track.properties.length === 1 && track.properties[0]!.target.kind === "layer",
    ),
  ).toBe(true);
  expect(page().layers.find((layer) => layer.id === "hero")!.effects).toEqual([]);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});

test("appending a moved occurrence pins another inherited end instead of growing it across the move", () => {
  const { engine, page, occurrences } = fixture();
  engine.execute({
    type: "setMotionTrackRange",
    trackId: occurrences()[0]!.id,
    start: t(0),
    end: t(1),
  });
  engine.execute({ type: "addMotionOccurrence", layerId: "hero", start: t(1), end: null });
  const original = occurrences()[0]!.id;
  engine.execute({ type: "moveMotionTrack", trackId: original, delta: t(3) });
  expect(occurrences().map((track) => [track.start, track.end])).toEqual([
    [t(1), t(2)],
    [t(3), t(4)],
  ]);
  expect(page().motion!.duration).toEqual(t(4));
});

test("a reopened v2 document reserves every occurrence ID before allocating another", () => {
  const { engine, occurrences } = fixture();
  engine.execute({ type: "duplicateMotionOccurrence", trackId: occurrences()[0]!.id, start: t(3) });
  const imported = structuredClone(engine.getSnapshot().project);
  imported.pages[0]!.motion!.tracks[3]!.id = "track-4";
  const reopened = new EditorEngine(imported);
  reopened.execute({ type: "addMotionOccurrence", layerId: "hero", start: t(6), end: t(7) });
  const tracks = reopened.getSnapshot().project.pages[0]!.motion!.tracks;
  expect(new Set(tracks.map((track) => track.id)).size).toBe(tracks.length);
  expect(tracks.at(-1)!.id).toBe("track-5");
});

test("copies into a bounded gap in one undo without discarding retimed off-range keys", () => {
  const { engine, occurrences, page } = fixture();
  const before = engine.getSnapshot();
  engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: occurrences()[0]!.id,
    start: t(3),
    end: t(7, 2),
  });
  const copy = occurrences()[1]!;
  expect(copy.end).toEqual(t(7, 2));
  expect(copy.properties[0]!.keyframes.map((key) => key.time)).toEqual([t(3), t(5)]);
  expect(page().layers).toEqual(before.project.pages[0]!.layers);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});

test("v2 preserves signed pre-roll when a trimmed clip is duplicated earlier, including serialization and undo", () => {
  const { engine, page, occurrences } = fixture();
  engine.execute({
    type: "upsertMotionKeyframe",
    target,
    time: t(2),
    value: 200,
    easing: { type: "linear" },
  });
  const first = occurrences()[0]!.id;
  engine.execute({ type: "setMotionTrackRange", trackId: first, start: t(1), end: t(2) });
  const before = engine.getSnapshot();
  engine.execute({ type: "duplicateMotionOccurrence", trackId: first, start: t(0) });
  const copy = occurrences()[0]!;
  expect(copy.properties[0]!.keyframes.map((key) => key.time)).toEqual([t(-1), t(1)]);
  const project = engine.getSnapshot().project;
  expect(parseProject(serializeProject(project))).toEqual(project);
  const program = compileMotion(project, { compositionId: page().id });
  expect(evaluateMotion(program, t(0)).values[0]!.value).toBe(100);
  expect(evaluateMotion(program, t(-1)).activeLayerIds).toEqual([]);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  expect(page().motion!.version).toBe(1);
});
