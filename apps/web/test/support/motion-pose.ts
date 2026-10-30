import {
  createLayer,
  createLayerGeometryIndex,
  createPage,
  createProject,
  EditorEngine,
} from "@musart/core";
import { image, video } from "../../../../packages/core/test/assets/fixtures";
import { SceneController } from "../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../src/state/session/preview-source";
import { createMotionTransport } from "../../src/services/motion/transport";

/** Paused media children under an animated parent; no native decoder is opened by this fixture. */
export function motionPoseFixture() {
  const photo = image(),
    clip = video();
  const group = createLayer("group", { id: "pose-group", x: 20, y: 20, width: 140, height: 100 });
  const picture = createLayer("image", {
    id: "pose-image",
    parentId: group.id,
    x: 5,
    y: 5,
    width: 30,
    height: 20,
    assetId: photo.id,
  });
  const movie = createLayer("video", {
    id: "pose-video",
    parentId: group.id,
    x: 65,
    y: 10,
    width: 40,
    height: 25,
    assetId: clip.id,
  });
  const engine = new EditorEngine(
    createProject({
      assets: { [photo.id]: photo, [clip.id]: clip },
      pages: [createPage({ width: 200, height: 160, layers: [group, picture, movie] })],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [layerId, property, from, to] of [
    [group.id, "rotation", 0, 30],
    [group.id, "x", 20, 40],
    [picture.id, "width", 30, 60],
    [picture.id, "height", 20, 40],
    [picture.id, "rotation", 0, 10],
  ] as const) {
    for (const value of [0, 1])
      engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId, property },
        time: { value, rate: 1 },
        value: value ? to : from,
      });
  }
  const transport = createMotionTransport(engine),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE);
  transport.seek({ value: 1, rate: 2 });
  const frame = controller.read(),
    index = createLayerGeometryIndex(frame.page);
  return {
    engine,
    transport,
    controller,
    frame,
    index,
    group,
    picture,
    movie,
    page: engine.getSnapshot().project.pages[0]!,
  };
}
