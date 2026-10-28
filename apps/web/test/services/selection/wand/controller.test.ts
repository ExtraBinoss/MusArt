import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { PixelSelectionController } from "../../../../src/services/selection/wand/controller";
import { WandClient, type WandWorkerPort } from "../../../../src/services/selection/wand/client";
import { createWandHost } from "../../../../src/services/selection/wand/worker-host";
import type { WandRequest } from "../../../../src/services/selection/wand/model";
const controllers: PixelSelectionController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});
function fixture() {
  const asset = {
      id: "original",
      name: "Original",
      mime: "image/png",
      width: 3,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
    },
    layer = createLayer("image", { id: "image", assetId: asset.id, width: 30, height: 10 }),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [layer] })], assets: { original: asset } }),
    ),
    data = new Uint8ClampedArray([10, 10, 10, 255, 50, 50, 50, 255, 10, 10, 10, 255]),
    pixels = vi.fn(async () => ({ data, width: 3, height: 1 }) as ImageData),
    encode = vi.fn<(data: Uint8ClampedArray, width: number, height: number) => string>(
      () => "data:image/png;base64,BBBB",
    ),
    host = createWandHost();
  let disposed = false;
  const worker: WandWorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(() => {
      disposed = true;
    }),
    postMessage: vi.fn((request: WandRequest) => {
      const result = host(request);
      queueMicrotask(() => {
        if (!disposed) worker.onmessage?.({ data: result } as MessageEvent);
      });
    }),
  };
  const controller = new PixelSelectionController(engine, {
    pixels,
    encode,
    client: () => new WandClient(worker),
    maskName: () => "Selected mask",
  });
  controllers.push(controller);
  engine.select([layer.id]);
  return { engine, controller, pixels, encode, worker, data, host };
}
it("accepts visible selections without document edits and creates an explicit reversible luminance mask", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project,
    transaction = vi.spyOn(d.engine, "transaction");
  await d.controller.begin("image", 0, 0, 0);
  expect(d.controller.read()).toMatchObject({ selected: 1, dragging: true });
  const accepting = d.controller.accept();
  expect(d.controller.accept()).toBe(accepting);
  await accepting;
  expect(d.controller.read()).toMatchObject({ selected: 1, dragging: false, busy: false });
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  await d.controller.createMask();
  expect(transaction).toHaveBeenCalledOnce();
  const snapshot = d.engine.getSnapshot(),
    mask = snapshot.project.pages[0]!.layers[0]!.mask!;
  expect(mask).toMatchObject({ mode: "luminance", enabled: true, inverted: false });
  expect(snapshot.project.assets[mask.assetId!]?.name).toBe("Selected mask");
  expect(d.encode.mock.calls[0]![0]).toEqual(
    new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
  );
  expect(d.controller.read()).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.engine.redo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toEqual(mask);
});
it("erases only through one explicit reversible mask commit and keeps the original image layer", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project,
    transaction = vi.spyOn(d.engine, "transaction");
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  expect(transaction).not.toHaveBeenCalled();
  await d.controller.erase();
  expect(transaction).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toMatchObject({
    mode: "luminance",
    enabled: true,
    inverted: true,
  });
  expect(d.engine.getSnapshot().project.assets.original).toEqual(before.assets.original);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
it("reuses the original source, restores an accepted selection on cancellation and inverts without undo", async () => {
  const d = fixture();
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  const accepted = d.controller.read();
  await d.controller.begin("image", 10, 0, 0, "add");
  expect(d.controller.read()?.selected).toBe(2);
  d.controller.cancel();
  expect(d.controller.read()).toBe(accepted);
  await d.controller.accept();
  await d.controller.invert();
  expect(d.controller.read()?.selected).toBe(2);
  expect(d.pixels).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.controller.deselect();
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  await d.controller.createMask();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
it("rejects late image preparation across replacement projects, selection changes and disposal", async () => {
  const d = fixture();
  let release!: (value: ImageData) => void;
  d.pixels.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = d.controller.begin("image", 0, 0, 0);
  await vi.waitFor(() => expect(d.pixels).toHaveBeenCalledOnce());
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  release({ data: d.data, width: 3, height: 1 } as ImageData);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(d.controller.read()).toBeNull();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  const other = fixture(),
    starting = other.controller.begin("image", 0, 0, 0);
  other.controller.cancel();
  await expect(starting).rejects.toMatchObject({ name: "AbortError" });
  await other.controller.begin("image", 0, 0, 0);
  other.engine.select([]);
  expect(other.controller.read()).toBeNull();
  other.controller.dispose();
  await expect(other.controller.begin("image", 0, 0, 0)).rejects.toMatchObject({
    name: "AbortError",
  });
});
it("rejects invalid targets and restores ownership on encoding errors", async () => {
  const d = fixture();
  await expect(d.controller.begin("missing", 0, 0, 0)).rejects.toThrow("unlocked image");
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  d.encode.mockImplementationOnce(() => {
    throw Error("encoder unavailable");
  });
  await expect(d.controller.createMask()).rejects.toThrow("encoder unavailable");
  expect(d.controller.read()).toBeNull();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(d.worker.terminate).toHaveBeenCalledOnce();
});
it("rejects oversized sources before decoding or creating a worker", async () => {
  const d = fixture(),
    project = structuredClone(d.engine.getSnapshot().project);
  project.assets.original!.width = project.assets.original!.height = 4097;
  d.engine.load(project);
  d.engine.select(["image"]);
  await expect(d.controller.begin("image", 0, 0, 0)).rejects.toHaveProperty(
    "code",
    "PIXEL_SELECTION_TOO_LARGE",
  );
  expect(d.pixels).not.toHaveBeenCalled();
  expect(d.worker.postMessage).not.toHaveBeenCalled();
});
it("coalesces a cold drag to its latest tolerance instead of queueing every pointer move", async () => {
  const d = fixture();
  let release!: (value: ImageData) => void;
  d.pixels.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const begin = d.controller.begin("image", 0, 0, 0);
  await vi.waitFor(() => expect(d.pixels).toHaveBeenCalledOnce());
  const updates = Array.from({ length: 100 }, (_unused, index) => d.controller.update(index * 3));
  expect(new Set(updates).size).toBe(1);
  release({ data: d.data, width: 3, height: 1 } as ImageData);
  await Promise.all([begin, ...updates]);
  expect(d.controller.read()).toMatchObject({ tolerance: 255, selected: 3 });
  expect(
    vi.mocked(d.worker.postMessage).mock.calls.filter(([request]) => request.type === "preview"),
  ).toHaveLength(1);
});
it("keeps restored actions disabled until a canceled draft has actually left the worker", async () => {
  const d = fixture();
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  let release!: () => void;
  vi.mocked(d.worker.postMessage).mockImplementationOnce((request) => {
    release = () => d.worker.onmessage?.({ data: d.host(request) } as MessageEvent);
  });
  const pending = d.controller.begin("image", 10, 0, 0, "add");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  d.controller.cancel();
  expect(d.controller.read()).toMatchObject({ selected: 1, busy: true, dragging: false });
  const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  release();
  await rejection;
  await vi.waitFor(() => expect(d.controller.read()?.busy).toBe(false));
  await d.controller.invert();
  expect(d.controller.read()?.selected).toBe(2);
});
it("serializes a new gesture behind an in-flight inversion and starts from the acknowledged base", async () => {
  const d = fixture();
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  let release!: () => void;
  vi.mocked(d.worker.postMessage).mockImplementationOnce((request) => {
    release = () => d.worker.onmessage?.({ data: d.host(request) } as MessageEvent);
  });
  const inversion = d.controller.invert();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const before = vi.mocked(d.worker.postMessage).mock.calls.length,
    next = d.controller.begin("image", 0, 0, 0, "add");
  await Promise.resolve();
  expect(vi.mocked(d.worker.postMessage).mock.calls).toHaveLength(before);
  expect(d.controller.read()).toMatchObject({ busy: true, dragging: false });
  release();
  await Promise.all([inversion, next]);
  expect(d.controller.read()).toMatchObject({ selected: 3, dragging: true, busy: false });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
it("binds explicit mask export to its gesture and rejects a waiting new gesture after the mask commits", async () => {
  const d = fixture();
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  let release!: () => void;
  vi.mocked(d.worker.postMessage).mockImplementationOnce((request) => {
    release = () => d.worker.onmessage?.({ data: d.host(request) } as MessageEvent);
  });
  const creating = d.controller.createMask();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const waiting = d.controller.begin("image", 10, 0, 0),
    rejected = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  release();
  await creating;
  await rejected;
  expect(d.encode).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toMatchObject({
    mode: "luminance",
  });
  d.engine.undo();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
it("cancels an in-flight mask export before encoding or publishing any document edit", async () => {
  const d = fixture();
  await d.controller.begin("image", 0, 0, 0);
  await d.controller.accept();
  const original = d.engine.getSnapshot().project;
  let release!: () => void;
  vi.mocked(d.worker.postMessage).mockImplementationOnce((request) => {
    release = () => d.worker.onmessage?.({ data: d.host(request) } as MessageEvent);
  });
  const creating = d.controller.createMask(),
    rejected = expect(creating).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  d.controller.cancel();
  expect(d.controller.read()?.busy).toBe(true);
  release();
  await rejected;
  expect(d.encode).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(d.controller.read()).toBeNull();
});
