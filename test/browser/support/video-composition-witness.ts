import {
  applyMotionFrame,
  compileMotion,
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  planMotionInitialization,
  type MotionTime,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { createRenderSession, probeVideoOriginal } from "../../../packages/render/src/index";
import { createVideoFixture } from "./video-source-witness";

/** Exercises the same document evaluator, retained compositor, original decoder and GPU effects as the editor. */
export async function runVideoCompositionWitness(forceWebGL: boolean) {
  const { blob, codec } = await createVideoFixture(),
    metadata = await probeVideoOriginal(blob);
  const video: VideoAsset = {
    id: "video",
    kind: "video",
    name: "Native VFR",
    mime: blob.type,
    originalId: "original",
    contentRevision: `vfr-${codec}`,
    byteLength: blob.size,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    firstTimestamp: metadata.firstTimestamp,
    timeResolution: metadata.timeResolution,
    orientation: metadata.orientation,
  };
  const photo = {
    id: "photo",
    name: "Overlay",
    mime: "image/svg+xml",
    width: 8,
    height: 8,
    dataUrl: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="white"/></svg>')}`,
  };
  const effect = createEffect("brightness", { amount: 0.5 });
  const page = createPage({
    id: "page",
    width: 64,
    height: 64,
    background: "#ffffff",
    layers: [
      createLayer("group", { id: "group", x: 0, y: 0, width: 64, height: 64 }),
      createLayer("video", {
        id: "clip",
        parentId: "group",
        assetId: video.id,
        x: 0,
        y: 0,
        width: 64,
        height: 64,
        mask: { enabled: true, inverted: false, layerId: "mask" },
        effects: [effect],
      }),
      createLayer("rectangle", {
        id: "mask",
        maskSource: true,
        x: 0,
        y: 0,
        width: 48,
        height: 64,
        fill: "#ffffff",
      }),
      createLayer("image", { id: "overlay", assetId: photo.id, x: 28, y: 28, width: 8, height: 8 }),
    ],
  });
  const engine = new EditorEngine(
    createProject({
      id: "native-video-composition",
      pages: [page],
      assets: { [video.id]: video, [photo.id]: photo },
    }),
  );
  const plan = planMotionInitialization(engine.getSnapshot(), metadata.duration);
  engine.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: true });
  engine.transaction([
    {
      type: "upsertMotionKeyframe",
      target: { kind: "effect", layerId: "clip", effectId: effect.id, property: "amount" },
      time: { value: 0, rate: 1 },
      value: 0.5,
    },
    {
      type: "upsertMotionKeyframe",
      target: { kind: "effect", layerId: "clip", effectId: effect.id, property: "amount" },
      time: metadata.duration,
      value: 0.5,
      easing: { type: "cubicBezier", x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
    },
  ]);
  const project = engine.getSnapshot().project,
    program = compileMotion(project, { compositionId: page.id });
  const session = createRenderSession({
    forceWebGL,
    maxBytes: 32 * 1024 * 1024,
    mediaResolver: {
      resolveOriginal: async (asset) => {
        if (
          asset.originalId !== video.originalId ||
          asset.contentRevision !== video.contentRevision
        )
          throw Error("Stale original resolver request.");
        return blob;
      },
    },
  });
  const images: string[] = [],
    timings: number[] = [],
    samples: unknown[] = [];
  let stats;
  try {
    const requests: { time: MotionTime; terminalPreview?: boolean }[] = [0, 0.5, 1, 0.5, 0].map(
      (seconds) => ({ time: { value: seconds * 100, rate: 100 } }),
    );
    requests.push({ time: metadata.duration, terminalPreview: true }, { time: metadata.duration });
    for (const request of requests) {
      const frame = evaluateMotion(program, request.time, request),
        composition = applyMotionFrame(program, frame),
        started = performance.now();
      images.push(
        await session.withCanvasFrame(
          composition,
          project.assets,
          (canvas) => canvas.toDataURL("image/png"),
          { motionFrame: frame },
        ),
      );
      timings.push(performance.now() - started);
      samples.push(frame.mediaRequests);
    }
    stats = session.stats();
  } finally {
    await session.dispose();
  }
  return {
    codec,
    metadata,
    images,
    timings,
    samples,
    stats,
    disposedStats: session.stats(),
    browser: navigator.userAgent,
    nativeResources: {
      ...(window as unknown as { __musartNativeVideo: object }).__musartNativeVideo,
    },
    readbacks: {
      ...(window as unknown as { __musartVideoReadbacks: object }).__musartVideoReadbacks,
    },
  };
}
