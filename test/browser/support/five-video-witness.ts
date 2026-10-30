import {
  createLayer,
  createPage,
  createProject,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  type VideoAsset,
} from "@musart/core";
import { createRenderSession } from "../../../packages/render/src/export/standalone";
import { probeVideoOriginal } from "../../../packages/render/src/sources/video/probe";

/** Uses actual original files, the production compositor/decoder path and a bounded latest-only render queue. */
export async function prepareFiveVideoWitness(count = 5) {
  const originals: Record<string, Blob> = {},
    assets: Record<string, VideoAsset> = {};
  for (let i = 0; i < count; i++) {
    const blob = await (await fetch(`/media/video-${i}.mp4`)).blob(),
      metadata = await probeVideoOriginal(blob);
    const asset: VideoAsset = {
      id: `video-${i}`,
      kind: "video",
      name: `Video ${i}`,
      mime: "video/mp4",
      originalId: `original-${i}`,
      contentRevision: "v1",
      byteLength: blob.size,
      ...metadata,
    };
    assets[asset.id] = asset;
    originals[asset.id] = blob;
  }
  const layers = Object.values(assets).map((asset, i) =>
    createLayer("video", {
      id: `layer-${i}`,
      assetId: asset.id,
      x: (i % 3) * 426,
      y: Math.floor(i / 3) * 360,
      width: 426,
      height: 240,
    }),
  );
  const page = createPage({
    id: "five-videos",
    width: 1280,
    height: 720,
    background: "#14141a",
    layers,
    motion: {
      version: 1,
      initialized: true,
      mode: "motion",
      duration: { value: 4, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: layers.map((layer) => ({
        id: `track-${layer.id}`,
        layerId: layer.id,
        start: { value: 0, rate: 1 },
        end: { value: 4, rate: 1 },
        properties: [],
        media: { sourceIn: { value: 0, rate: 1 }, mute: true, volume: 1 },
      })),
    },
  });
  const project = createProject({ pages: [page], assets }),
    program = compileMotion(project, { compositionId: page.id });
  const resolver = { resolveOriginal: async (asset: { id: string }) => originals[asset.id]! };
  const session = createRenderSession({ maxBytes: 384 * 1024 * 1024, mediaResolver: resolver });
  let allowed = false,
    useProxy = false;
  const listeners = new Set<() => void>();
  const activity = {
    read: () => allowed,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const render = async (time: number, playback = false) => {
    const frame = evaluateMotion(program, { value: Math.round(time * 1000000), rate: 1000000 });
    const composition = applyMotionFrame(program, frame);
    return session.withCanvasFrame(
      composition,
      assets,
      (canvas) => {
        if (!canvas.isConnected) document.body.append(canvas);
        return undefined;
      },
      {
        motionFrame: frame,
        mediaMode: playback ? "playback" : "preview",
        profileVideo: true,
        ...(useProxy ? { videoProxy: activity } : {}),
      },
    );
  };
  return {
    assets,
    async initial() {
      await render(0);
      return session.stats();
    },
    async prepareProxies() {
      useProxy = true;
      allowed = true;
      for (const fn of listeners) fn();
      await render(0);
    },
    stats: () => session.stats(),
    setPreparationAllowed(value: boolean) {
      allowed = value;
      for (const fn of listeners) fn();
    },
    async run(durationMs = 2500, proxies = useProxy) {
      useProxy = proxies;
      allowed = false;
      for (const fn of listeners) fn();
      await render(0, false);
      const errors: string[] = [];
      const before = session.stats(),
        samples: { requested: number; ready: number }[] = [],
        raf: number[] = [];
      let running = true,
        active: Promise<void> | null = null,
        latest = 0,
        last = 0;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const pump = () => {
          if (active || !running) return;
          const requested = latest;
          active = render(requested, true)
            .then(() => {
              samples.push({ requested, ready: (performance.now() - start) / 1000 });
            })
            .catch((error) => {
              errors.push(String(error));
              running = false;
            })
            .finally(() => {
              active = null;
              if (running && latest > requested) pump();
            });
        };
        const tick = (at: number) => {
          if (last) raf.push(at - last);
          last = at;
          if (!running || at - start >= durationMs) {
            running = false;
            resolve();
            return;
          }
          latest = Math.min(3.5, (at - start) / 1000);
          pump();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await Promise.resolve(active);
      return {
        duration: performance.now() - start,
        before,
        after: session.stats(),
        samples,
        raf,
        errors,
      };
    },
    async image() {
      return session.withCanvasFrame(
        applyMotionFrame(program, evaluateMotion(program, { value: 1, rate: 1 })),
        assets,
        (canvas) => canvas.toDataURL("image/png"),
        {
          motionFrame: evaluateMotion(program, { value: 1, rate: 1 }),
          mediaMode: "preview",
          ...(useProxy ? { videoProxy: activity } : {}),
        },
      );
    },
    async close() {
      await session.dispose();
      return session.stats();
    },
  };
}
