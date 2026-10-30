import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { compileMotion } from "../../src/motion/compile";
import { evaluateMotion } from "../../src/motion/evaluate";
import { applyMotionFrame } from "../../src/motion/frame";
import { createMotionKeyframePreview } from "../../src/motion/keyframe-preview";
import { video } from "../assets/fixtures";
const t = (value: number, rate = 1) => ({ value, rate });
function fixture() {
  const asset = video();
  const page = createPage({
    id: "page",
    layers: [
      createLayer("group", { id: "group" }),
      createLayer("video", { id: "clip", parentId: "group", assetId: asset.id }),
    ],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: t(5),
      frameRate: { numerator: 30000, denominator: 1001 },
      tracks: [
        { id: "g1", layerId: "group", start: t(0), end: t(1), properties: [] },
        { id: "g2", layerId: "group", start: t(2), end: t(5), properties: [] },
        ...[0, 3].map((value) => ({
          id: `clip${value}`,
          layerId: "clip",
          start: t(value),
          end: t(value + 2),
          media: { sourceIn: t(value === 0 ? 1 : 2), mute: value === 0, volume: 0.5 },
          properties: [
            {
              id: `p${value}`,
              target: { kind: "layer" as const, layerId: "clip", property: "x" as const },
              keyframes: [
                { id: `a${value}`, time: t(value), value: value * 100 },
                { id: `b${value}`, time: t(value + 2), value: value * 100 + 200 },
              ],
            },
          ],
        })),
      ],
    },
  });
  return createProject({ assets: { [asset.id]: asset }, pages: [page] });
}
test("only one canonical visual layer and its own keys/source mapping are active at a time", () => {
  const project = fixture(),
    program = compileMotion(project, { compositionId: "page" });
  const first = evaluateMotion(program, t(1, 2));
  expect(first.activeLayerIds).toEqual(["group", "clip"]);
  expect(first.values.filter((value) => value.target.layerId === "clip")).toEqual([
    { target: { kind: "layer", layerId: "clip", property: "x" }, value: 50 },
  ]);
  expect(first.mediaRequests[0]).toMatchObject({ sourceTime: t(1), mute: true });
  expect(evaluateMotion(program, t(3, 2)).activeLayerIds).toEqual([]);
  expect(evaluateMotion(program, t(5, 2)).activeLayerIds).toEqual(["group"]);
  const later = evaluateMotion(program, t(7, 2));
  expect(later.activeLayerIds).toEqual(["group", "clip"]);
  expect(later.values[0]!.value).toBe(350);
  expect(later.mediaRequests[0]).toMatchObject({ sourceTime: t(2), mute: false });
  expect(applyMotionFrame(program, later).layers).toHaveLength(2);
  expect(evaluateMotion(program, t(5)).activeLayerIds).toEqual([]);
  const terminal = evaluateMotion(program, t(5), { terminalPreview: true });
  expect(terminal.activeLayerIds).toEqual(["group", "clip"]);
  expect(terminal.values[0]!.value).toBe(500);
  for (const time of [t(7, 2), t(0), t(1, 2), t(5, 2), t(7, 2)])
    expect(evaluateMotion(program, time)).toEqual(evaluateMotion(program, time));
});
test("one occurrence splits at ancestor gaps without duplicating key values or shifting sourceIn", () => {
  const project = fixture(),
    motion = project.pages[0]!.motion!;
  motion.tracks = motion.tracks.filter((track) => track.id !== "clip3");
  motion.tracks.find((track) => track.id === "clip0")!.end = t(4);
  const program = compileMotion(project, { compositionId: "page" });
  expect(
    program.layers.filter((layer) => layer.id === "clip").map((layer) => [layer.start, layer.end]),
  ).toEqual([
    [t(0), t(1)],
    [t(2), t(4)],
  ]);
  expect(evaluateMotion(program, t(3)).values).toHaveLength(1);
  expect(evaluateMotion(program, t(3)).mediaRequests[0]!.sourceTime).toEqual(t(7, 2));
  const draft = createMotionKeyframePreview(program, ["b0"]).sample(t(1));
  expect(evaluateMotion(draft, t(3)).values[0]!.value).toBe(200);
  expect(evaluateMotion(program, t(3, 2)).mediaRequests).toEqual([]);
});
test("keyframe drafts retime only the selected occurrence and never mutate the frozen program", () => {
  const program = compileMotion(fixture(), { compositionId: "page" });
  const draft = createMotionKeyframePreview(program, ["a3"]).sample(t(1, 2));
  expect(
    draft.composition.motion!.tracks.find((track) => track.id === "clip3")!.properties[0]!
      .keyframes[0]!.time,
  ).toEqual(t(7, 2));
  expect(
    draft.composition.motion!.tracks.find((track) => track.id === "clip0")!.properties[0]!
      .keyframes[0]!.time,
  ).toEqual(t(0));
  expect(
    program.composition.motion!.tracks.find((track) => track.id === "clip3")!.properties[0]!
      .keyframes[0]!.time,
  ).toEqual(t(3));
});
test("Static ignores all repeated occurrences and retains canonical base order and video poster", () => {
  const project = fixture();
  project.pages[0]!.motion!.mode = "static";
  const program = compileMotion(project, { compositionId: "page" });
  expect(program.layers).toHaveLength(2);
  const frame = evaluateMotion(program, t(100));
  expect(frame.activeLayerIds).toEqual(["group", "clip"]);
  expect(frame.values).toEqual([]);
  expect(frame.mediaRequests[0]).toMatchObject({ sourceTime: t(-1, 2), mute: true, volume: 0 });
});

test("an unanimated occurrence returns to canonical base without retaining an earlier occurrence's values", () => {
  const project = fixture();
  project.pages[0]!.motion!.tracks.find((track) => track.id === "clip3")!.properties = [];
  const program = compileMotion(project, { compositionId: "page" });
  const early = applyMotionFrame(program, evaluateMotion(program, t(1, 2)));
  expect(early.layers[1]!.x).toBe(50);
  const later = applyMotionFrame(program, evaluateMotion(program, t(7, 2)));
  expect(later.layers[1]!.x).toBe(80);
  expect(evaluateMotion(program, t(1, 2)).values[0]!.value).toBe(50);
  expect(program.composition.layers[1]!.x).toBe(80);
});
