import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { makeGpuRenderer } from "../gpu-fixture";
afterEach(() => vi.restoreAllMocks());
it("reuses a certified frame through ruler bursts and history without reentering composition, but rejects a paint change", async () => {
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer),
    engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            width: 64,
            height: 64,
            layers: [createLayer("rectangle", { width: 20, height: 20 })],
          }),
        ],
      }),
    );
  const original = engine.getSnapshot().project,
    frame = await graph.render(original.pages[0]!, original.assets),
    stats = graph.stats();
  for (let at = 0; at < 60; at++) {
    engine.execute({ type: "updatePage", patch: { rulers: at % 2 === 0 } });
    const current = engine.getSnapshot().project;
    expect(graph.retainedFrame(current.pages[0]!, current.assets, 1)).toBe(frame);
  }
  for (const history of [engine.undo, engine.redo]) {
    history();
    const current = engine.getSnapshot().project;
    expect(graph.retainedFrame(current.pages[0]!, current.assets, 1)).toBe(frame);
  }
  expect(graph.stats()).toMatchObject({
    frames: stats.frames,
    passes: stats.passes,
    uploads: stats.uploads,
    cacheBytes: stats.cacheBytes,
    targets: stats.targets,
  });
  engine.execute({
    type: "updateLayers",
    ids: [original.pages[0]!.layers[0]!.id],
    patch: { fill: "#ff0000" },
  });
  const changed = engine.getSnapshot().project;
  expect(graph.retainedFrame(changed.pages[0]!, changed.assets, 1)).toBeNull();
  await graph.render(changed.pages[0]!, changed.assets);
  expect(graph.retainedFrame(original.pages[0]!, original.assets, 1)).toBeNull();
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ targets: 0, cacheBytes: 0 });
});
