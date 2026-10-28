import { expect, test, vi } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Asset,
} from "@musart/core";
import { createPreviewExport } from "../../../src/services/session/previews";
import { ThumbnailPreviews } from "../../../src/services/projects/thumbnails/previews";
import type { ThumbnailPreviewOptions } from "../../../src/services/projects/thumbnails/previews";

function fixture() {
  const first = createPage({
    id: "first",
    layers: [createLayer("rectangle", { id: "a", width: 20, height: 30 })],
  });
  const second = createPage({
    id: "second",
    layers: [createLayer("ellipse", { id: "b", width: 80, height: 40 })],
  });
  const engine = new EditorEngine(createProject({ pages: [first, second] }));
  const preview = vi.fn(
    async (
      _key: string,
      _page: typeof first,
      _assets: Record<string, Asset>,
      _options?: ThumbnailPreviewOptions,
    ) => ({ blob: new Blob(["preview"]), width: 80, height: 40 }),
  );
  return { engine, preview, run: createPreviewExport(engine, { preview }) };
}

test("previews an inactive artboard's layer without changing the editing page or selection", async () => {
  const { engine, preview, run } = fixture();
  engine.select(["a"]);
  const before = engine.getSnapshot();
  const signal = new AbortController().signal;
  await run({ pageId: "second", selection: ["b"], edge: 96, priority: "background" }, signal);
  expect(engine.getSnapshot()).toBe(before);
  expect(preview.mock.calls[0]![1]).toMatchObject({
    width: 80,
    height: 40,
    background: "transparent",
  });
  expect(preview.mock.calls[0]![3]).toMatchObject({ edge: 96, signal, priority: "background" });
  expect(preview.mock.calls[0]![3]!.isCurrent!()).toBe(true);
});

test("explicit page scope survives activation and unrelated edits, but invalidates changed or deleted paint", async () => {
  const { engine, preview, run } = fixture();
  const options = { pageId: "second", selection: ["b"] };
  await run(options);
  const current = preview.mock.calls[0]![3]!.isCurrent!;
  options.pageId = "first";
  engine.setPage("second");
  engine.setPage("first");
  engine.execute({ type: "updateLayers", ids: ["a"], patch: { x: 12 } });
  expect(current()).toBe(true);
  await run({ pageId: "second", selection: ["b"] });
  expect(preview.mock.calls[1]![0]).toBe(preview.mock.calls[0]![0]);
  engine.setPage("second");
  engine.execute({ type: "updateLayers", ids: ["b"], patch: { opacity: 0.5 } });
  expect(current()).toBe(false);
  await run({ pageId: "second", all: true });
  const pageCurrent = preview.mock.calls[2]![3]!.isCurrent!;
  engine.execute({ type: "deletePage", id: "second" });
  expect(pageCurrent()).toBe(false);
  await expect(run({ pageId: "second" })).rejects.toMatchObject({ name: "AbortError" });
});

test("implicit export previews follow the active page while explicit full previews ignore another page's selection", async () => {
  const { engine, preview, run } = fixture();
  engine.select(["a"]);
  await run({});
  const current = preview.mock.calls[0]![3]!.isCurrent!;
  await run({ pageId: "second" });
  expect(preview.mock.calls[1]![1]).toBe(engine.getSnapshot().project.pages[1]);
  engine.setPage("second");
  expect(current()).toBe(false);
  const full = preview.mock.calls[1]![3]!.isCurrent!;
  engine.load(createProject());
  expect(full()).toBe(false);
});

test("rejects invalid dimensions, missing layers and aborted work before requesting a render", async () => {
  const { preview, run } = fixture();
  for (const edge of [1, 1025, 16.5]) await expect(run({ edge })).rejects.toThrow("size");
  await expect(run({ pageId: "second", selection: ["a"] })).rejects.toThrow("missing");
  const controller = new AbortController();
  controller.abort();
  await expect(run({}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(preview).not.toHaveBeenCalled();
});

test("second-page image, dither-stage and mask previews retain their own scope/dependencies and reject changed mask data", async () => {
  const image: Asset = {
    id: "image",
    name: "Image",
    width: 64,
    height: 64,
    mime: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
  };
  const matte: Asset = {
    ...image,
    id: "matte",
    name: "Mask",
    dataUrl: "data:image/png;base64,BBBB",
  };
  const dither = createEffect("dither", { id: "dither" }),
    later = createEffect("brightness", { id: "later" });
  const owner = createLayer("image", {
    id: "second-image",
    assetId: image.id,
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    effects: [dither, later],
    mask: { assetId: matte.id, mode: "luminance", enabled: false, inverted: false },
  });
  const first = createPage({ id: "first" }),
    second = createPage({ id: "second", layers: [owner] });
  const engine = new EditorEngine(
    createProject({ pages: [first, second], assets: { image, matte } }),
  );
  const preview = vi.fn(
    async (
      _key: string,
      _page: typeof first,
      _assets: Record<string, Asset>,
      _options?: ThumbnailPreviewOptions,
    ) => ({ blob: new Blob(["actual"]), width: 96, height: 96 }),
  );
  const run = createPreviewExport(engine, { preview }),
    before = engine.getSnapshot();
  await run({ pageId: second.id, selection: [owner.id], edge: 96 });
  await run({
    pageId: second.id,
    selection: [owner.id],
    edge: 96,
    variant: { kind: "effect", effectId: dither.id },
  });
  await run({ pageId: second.id, selection: [owner.id], edge: 96, variant: { kind: "mask" } });
  expect(engine.getSnapshot()).toBe(before);
  expect(new Set(preview.mock.calls.map((c) => c[0])).size).toBe(3);
  expect(preview.mock.calls[0]![1].layers.find((l) => l.id === owner.id)!.effects).toHaveLength(2);
  expect(preview.mock.calls[1]![1].layers.find((l) => l.id === owner.id)!.effects).toHaveLength(1);
  expect(preview.mock.calls[2]![1]).toMatchObject({ background: "#000000", width: 64, height: 64 });
  expect(preview.mock.calls.every((c) => c[2] === before.project.assets)).toBe(true);
  const maskCurrent = preview.mock.calls[2]![3]!.isCurrent!;
  engine.setPage(second.id);
  engine.setPage(first.id);
  expect(maskCurrent()).toBe(true);
  engine.load({
    ...engine.getSnapshot().project,
    assets: {
      ...engine.getSnapshot().project.assets,
      matte: { ...matte, dataUrl: "data:image/png;base64,CCCC" },
    },
  });
  expect(maskCurrent()).toBe(false);
  await expect(run({ pageId: second.id, all: true, variant: { kind: "mask" } })).rejects.toThrow(
    "one",
  );
});

test("the actual preview queue rejects a late second-page mask render after its dependency changes", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", undefined);
  let finish!: (value: { blob: Blob; width: number; height: number }) => void;
  const source = createLayer("ellipse", { id: "mask-source", maskSource: true });
  const owner = createLayer("rectangle", {
    id: "owner",
    mask: { layerId: source.id, enabled: false, inverted: false },
  });
  const first = createPage({ id: "first" }),
    second = createPage({ id: "second", layers: [source, owner] });
  const engine = new EditorEngine(createProject({ pages: [first, second] }));
  const renderer = {
    render: vi.fn(
      () =>
        new Promise<{ blob: Blob; width: number; height: number }>((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const queue = new ThumbnailPreviews(renderer, {
    busy: () => false,
    interacting: () => false,
    subscribe: () => () => {},
  });
  try {
    const run = createPreviewExport(engine, { preview: queue.preview.bind(queue) });
    const result = run({
      pageId: "second",
      selection: [owner.id],
      variant: { kind: "mask" },
      edge: 96,
    }).catch((error) => error as DOMException);
    await vi.advanceTimersByTimeAsync(0);
    expect(renderer.render).toHaveBeenCalledOnce();
    engine.setPage("second");
    engine.execute({ type: "updateLayers", ids: [source.id], patch: { opacity: 0.5 } });
    finish({ blob: new Blob(["late"]), width: 96, height: 96 });
    expect(await result).toMatchObject({ name: "AbortError" });
    expect(queue.stats().cacheEntries).toBe(0);
  } finally {
    await queue.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
