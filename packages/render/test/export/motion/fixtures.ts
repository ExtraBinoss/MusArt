import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type VideoAsset,
} from "@musart/core";
export function videoAsset(patch: Partial<VideoAsset> = {}): VideoAsset {
  return {
    id: "original",
    kind: "video",
    name: "Original",
    mime: "video/mp4",
    width: 32,
    height: 24,
    originalId: "source-hash",
    contentRevision: "version1",
    byteLength: 1,
    duration: { value: 4, rate: 1 },
    firstTimestamp: { value: 1, rate: 2 },
    timeResolution: 1000,
    orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
    ...patch,
  };
}
export function motionProject() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "composition",
          width: 32,
          height: 24,
          layers: [createLayer("rectangle", { id: "shape", x: 0 })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 103, rate: 100 } });
  for (const value of [0, 1])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "shape", property: "x" },
      time: { value, rate: 1 },
      value: value * 20,
    });
  return engine.getSnapshot().project;
}
