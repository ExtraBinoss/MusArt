import { expect, test } from "vitest";
import { transformPoint } from "@musart/core";
import {
  editablePresentedLayer,
  pickMotionPlayback,
} from "../../../src/canvas/selection/presented-pick";
import { motionPoseFixture } from "../../support/motion-pose";

const click = { button: 0, shiftKey: false, ctrlKey: false, metaKey: false };
test("editable handles resolve the evaluated pose and reject playback/hidden/locked targets", () => {
  const d = motionPoseFixture();
  expect(editablePresentedLayer(d.frame, d.picture.id)?.width).toBe(45);
  expect(editablePresentedLayer({ ...d.frame, playback: true }, d.picture.id)).toBeNull();
  expect(editablePresentedLayer(d.frame, undefined)).toBeNull();
  expect(editablePresentedLayer(d.frame, "missing")).toBeNull();
  for (const patch of [{ visible: false }, { opacity: 0 }, { locked: true }]) {
    const frame = {
      ...d.frame,
      page: {
        ...d.frame.page,
        layers: d.frame.page.layers.map((layer) =>
          layer.id === d.group.id ? { ...layer, ...patch } : layer,
        ),
      },
    };
    expect(editablePresentedLayer(frame, d.picture.id)).toBeNull();
  }
});
test("Play picks visible image/video children without document edits or permitting replay picks", () => {
  const d = motionPoseFixture(),
    before = d.engine.getSnapshot();
  d.transport.play();
  try {
    for (const id of [d.picture.id, d.movie.id]) {
      const layer = d.index.get(id),
        point = transformPoint(d.index.worldMatrix(id), {
          x: layer.width / 2,
          y: layer.height / 2,
        });
      pickMotionPlayback(d.engine, { ...d.frame, playback: true }, point, click);
      expect(d.engine.getSnapshot().selection).toEqual([id]);
    }
    const selected = d.engine.getSnapshot().selection;
    pickMotionPlayback(d.engine, { ...d.frame, playback: true }, { x: -1, y: 20 }, click);
    pickMotionPlayback(
      d.engine,
      { ...d.frame, playback: true },
      { x: 20, y: 20 },
      { ...click, button: 2 },
    );
    expect(d.engine.getSnapshot().selection).toBe(selected);
    expect(d.engine.getSnapshot().project).toBe(before.project);
    expect(d.engine.getSnapshot().revision).toBe(before.revision);
  } finally {
    d.transport.pause();
  }
  d.engine.select([]);
  const layer = d.index.get(d.picture.id),
    point = transformPoint(d.index.worldMatrix(layer.id), {
      x: layer.width / 2,
      y: layer.height / 2,
    });
  pickMotionPlayback(d.engine, { ...d.frame, playback: true }, point, click);
  expect(d.engine.getSnapshot().selection).toEqual([]);
});
