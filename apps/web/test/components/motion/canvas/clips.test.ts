import { expect, it } from "vitest";
import { indexTimelineCanvas } from "../../../../src/components/motion/canvas/index";
import {
  projectCanvasAudio,
  projectCanvasClips,
} from "../../../../src/components/motion/canvas/clips";
import { canvasFixture } from "./support";

it("culls occurrences horizontally, retaining full authored gap bounds", () => {
  const d = canvasFixture();
  const indexed = indexTimelineCanvas(d.rows).get(0)!;
  const result = projectCanvasClips(indexed, 0, d.model, {
    left: 130,
    top: 0,
    width: 40,
    height: 24,
  });
  expect(result.clips).toEqual([]);
  expect(result.gaps).toHaveLength(1);
  expect(result.gaps[0]).toMatchObject({ start: 1, end: 2, bounds: { x: 0, width: 40 } });
  const moved = projectCanvasClips(
    indexed,
    0,
    {
      ...d.model,
      draft: {
        action: "move",
        delta: { value: 3, rate: 2 },
        trackId: "first",
        keyIds: new Set(),
        layerIds: new Set(),
      },
    },
    { left: 130, top: 0, width: 40, height: 24 },
  );
  expect(moved.clips.map((clip) => clip.hit)).toMatchObject([
    { trackId: "first", bounds: { x: 20 } },
  ]);
  expect(d.tracks[0]?.start).toEqual({ value: 0, rate: 1 });
});
it("previews only the selected occurrence's trim and keeps independent audio source mapping", () => {
  const d = canvasFixture();
  const model = {
    ...d.model,
    draft: {
      action: "trimEnd" as const,
      delta: { value: 1, rate: 2 },
      trackId: "first",
      keyIds: new Set<string>(),
      layerIds: new Set<string>(),
    },
  };
  const result = projectCanvasClips(indexTimelineCanvas(d.rows).get(0)!, 0, model, {
    left: 0,
    top: 0,
    width: 400,
    height: 24,
  });
  expect(result.clips.map((clip) => clip.bounds.width)).toEqual([150, 100]);
  expect(result.clips[0]?.trims.map((trim) => trim.bounds.width)).toEqual([6, 6]);
  const audio = projectCanvasAudio(
    d.audio,
    2,
    {
      ...d.model,
      audioDraft: {
        trackId: "sound",
        start: 0.5,
        end: 2,
        sourceIn: 1,
      },
    },
    { left: 40, top: 24, width: 100, height: 80 },
  );
  expect(audio).toMatchObject({
    kind: "audio",
    mediaKind: "audio",
    sourceIn: 1,
    bounds: { x: 10, y: 27, width: 150 },
    duration: 1.5,
  });
  expect(
    projectCanvasAudio(d.audio, 2, d.model, { left: 400, top: 0, width: 100, height: 80 }),
  ).toBeNull();
});
it("moves every captured group descendant occurrence while leaving unrelated clips at their authored time", () => {
  const d = canvasFixture(),
    indexed = indexTimelineCanvas(d.rows).get(0)!;
  const moved = projectCanvasClips(
    indexed,
    0,
    {
      ...d.model,
      draft: {
        action: "move",
        delta: { value: 1, rate: 2 },
        trackId: "parent",
        trackIds: new Set(["first", "second"]),
        layerIds: new Set(["parent", "hero"]),
        keyIds: new Set(),
      },
    },
    { left: 0, top: 0, width: 400, height: 24 },
  );
  expect(moved.clips.map((clip) => clip.bounds.x)).toEqual([50, 250]);
  expect(d.tracks.map((track) => track.start)).toEqual([
    { value: 0, rate: 1 },
    { value: 2, rate: 1 },
  ]);
  const onlyOne = projectCanvasClips(
    indexed,
    0,
    {
      ...d.model,
      draft: {
        action: "move",
        delta: { value: 1, rate: 2 },
        trackId: "first",
        trackIds: new Set(["first"]),
        layerIds: new Set(["hero"]),
        keyIds: new Set(),
      },
    },
    { left: 0, top: 0, width: 400, height: 24 },
  );
  expect(onlyOne.clips.map((clip) => clip.bounds.x)).toEqual([50, 200]);
});
