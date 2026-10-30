import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createCompositionExporter } from "../../../src/services/export/composition";
import { createMotionTransport } from "../../../src/services/motion/transport";

function fixture() {
  const layer = createLayer("rectangle", { id: "shape", x: 10, width: 20, height: 10 });
  const a = createPage({ id: "a", name: "Active", layers: [] });
  const b = createPage({
    id: "b",
    name: "Chosen:/artboard",
    width: 64,
    height: 32,
    layers: [layer],
  });
  const engine = new EditorEngine(createProject({ pages: [a, b] }));
  const image = vi.fn<typeof import("@musart/render").exportComposition>(
    async () => new Blob(["real-image"], { type: "image/png" }),
  );
  const video = vi.fn<typeof import("@musart/render").exportMotionVideo>(async () => ({
    blob: new Blob(["real-video"], { type: "video/webm" }),
    mimeType: "video/webm" as const,
    width: 128,
    height: 64,
    bytes: 10,
    frameRate: { numerator: 30, denominator: 1 },
    frameCount: 30,
    duration: { value: 1, rate: 1 },
    encodedDuration: { value: 1, rate: 1 },
    timestampResolution: 1000,
    audio: null,
  }));
  const render = vi.fn(async () => ({ exportComposition: image, exportMotionVideo: video }));
  const resolver = { resolveOriginal: vi.fn() },
    mediaResolverFor = vi.fn(() => resolver);
  const download = vi.fn();
  const run = createCompositionExporter(engine, { render, download, mediaResolverFor });
  const scope = () => ({
    projectId: engine.getSnapshot().project.id,
    compositionId: b.id,
    revision: engine.getSnapshot().revision,
    page: engine.getSnapshot().project.pages.find((page) => page.id === b.id)!,
  });
  return {
    engine,
    layer,
    a,
    b,
    image,
    video,
    render,
    resolver,
    mediaResolverFor,
    download,
    run,
    scope,
  };
}
test("exports a chosen inactive artboard by durable ID without selecting it or mutating history", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  const result = await d.run(
    {
      mode: "static",
      compositionId: "b",
      scale: 2,
      image: { format: "png", quality: 1, allPages: false },
    },
    d.scope(),
  );
  expect(d.image).toHaveBeenCalledWith(
    d.b,
    before.project.assets,
    expect.objectContaining({ scale: 2, mediaResolver: d.resolver }),
  );
  expect(d.mediaResolverFor).toHaveBeenCalledWith(before.project.id);
  expect(d.download).toHaveBeenCalledWith(expect.any(Blob), "Chosen--artboard.png");
  expect(result).toMatchObject({ mode: "static", width: 128, height: 64, bytes: 10 });
  expect(d.engine.getSnapshot()).toBe(before);
});
test("Static exports the base design even when a retained Motion clock has a different pose", async () => {
  const d = fixture();
  d.engine.setPage("b");
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: "shape", property: "x" },
    time: { value: 0, rate: 1 },
    value: 90,
  });
  const transport = createMotionTransport(d.engine);
  transport.seek({ value: 1, rate: 1 });
  d.engine.execute({ type: "setCompositionMode", mode: "static" });
  await d.run(
    {
      mode: "static",
      compositionId: "b",
      scale: 1,
      image: { format: "png", quality: 1, allPages: false },
    },
    d.scope(),
  );
  expect(d.image.mock.calls[0]![0].layers[0]!.x).toBe(10);
  expect(d.video).not.toHaveBeenCalled();
});
test("Motion routes the original project and chosen composition through the generic headless exporter", async () => {
  const d = fixture();
  d.engine.setPage("b");
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.setPage("a");
  const before = d.engine.getSnapshot(),
    progress = vi.fn();
  const result = await d.run(
    {
      mode: "motion",
      compositionId: "b",
      scale: 2,
      container: "auto",
      videoBitrate: 8_000_000,
      audioBitrate: 192_000,
      audio: false,
      onProgress: progress,
    },
    d.scope(),
  );
  expect(d.video).toHaveBeenCalledWith(
    before.project,
    expect.objectContaining({
      compositionId: "b",
      scale: 2,
      container: "auto",
      mediaResolver: d.resolver,
      videoBitrate: 8_000_000,
      audio: false,
    }),
  );
  expect(result).toMatchObject({ mode: "motion", filename: "Chosen--artboard.webm", width: 128 });
  expect(d.engine.getSnapshot()).toBe(before);
});
test.each(["revision", "reload", "missing", "mode"] as const)(
  "rejects stale %s before acquiring a renderer",
  async (change) => {
    const d = fixture(),
      scope = d.scope();
    if (change === "revision") d.engine.execute({ type: "renameProject", name: "Changed" });
    else if (change === "reload") d.engine.load(structuredClone(d.engine.getSnapshot().project));
    else if (change === "missing") d.engine.execute({ type: "deletePage", id: "b" });
    else {
      d.engine.setPage("b");
      d.engine.execute({ type: "setCompositionMode", mode: "motion" });
    }
    await expect(
      d.run(
        {
          mode: "static",
          compositionId: "b",
          scale: 1,
          image: { format: "png", quality: 1, allPages: false },
        },
        scope,
      ),
    ).rejects.toMatchObject({ name: "ExportScopeError" });
    expect(d.render).not.toHaveBeenCalled();
    expect(d.download).not.toHaveBeenCalled();
  },
);
test("aborted, empty and asynchronously stale outputs never download or report success", async () => {
  const d = fixture(),
    controller = new AbortController();
  controller.abort();
  const options = {
    mode: "static" as const,
    compositionId: "b",
    scale: 1,
    image: { format: "png" as const, quality: 1, allPages: false },
  };
  await expect(d.run({ ...options, signal: controller.signal }, d.scope())).rejects.toMatchObject({
    name: "AbortError",
  });
  d.image.mockResolvedValueOnce(new Blob());
  await expect(d.run(options, d.scope())).rejects.toThrow(/empty/);
  d.image.mockImplementationOnce(async () => {
    d.engine.execute({ type: "renameProject", name: "Concurrent" });
    return new Blob(["encoded"]);
  });
  await expect(d.run(options, d.scope())).rejects.toMatchObject({ name: "ExportScopeError" });
  expect(d.download).not.toHaveBeenCalled();
});
test("selection crops retain the originals and report delivered dimensions", async () => {
  const d = fixture();
  const result = await d.run(
    {
      mode: "static",
      compositionId: "b",
      scale: 2,
      image: { format: "png", quality: 1, allPages: false, selectionOnly: true },
      selection: ["shape"],
    },
    d.scope(),
  );
  expect(d.image.mock.calls[0]![0]).toMatchObject({ width: 20, height: 10 });
  expect(result).toMatchObject({ width: 40, height: 20 });
});
