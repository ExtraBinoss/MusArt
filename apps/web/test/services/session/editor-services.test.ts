import { afterEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  serializeProject,
  type Asset,
} from "@musart/core";
import type { SelectionClient } from "../../../src/services/selection/selection";
import { ThumbnailPipeline } from "../../../src/services/projects/thumbnails";
import { ThumbnailRenderer } from "../../../src/services/projects/thumbnails/renderer";
import { getAnimationSession } from "../../../src/services/animation/session";
import { ProjectStore } from "../../../src/services/projects/storage";
import {
  createEditorServices,
  installClipboard,
} from "../../../src/services/session/editor-services";
import { importBatch } from "../../../src/services/assets/imports";
import { downloadBlob } from "../../../src/services/files/download";
import { readDataUrl } from "../../../src/services/assets/imports";
import type { ExportOptions } from "../../../src/state/contracts";
const renderer = vi.hoisted(() => ({
  renderComposition: vi.fn(),
  exportComposition: vi.fn(),
  sourcePixels: vi.fn(),
}));
vi.mock("@musart/render", () => renderer);
vi.mock("../../../src/services/assets/imports", async () => {
  const actual = await vi.importActual<typeof import("../../../src/services/assets/imports")>(
    "../../../src/services/assets/imports",
  );
  return { ...actual, importBatch: vi.fn() };
});
vi.mock("../../../src/services/files/download", () => ({
  downloadBlob: vi.fn(),
  safeName: (name: string) => name.replace(/\//g, "-"),
}));
vi.mock("../../../src/services/selection/pixel-selection", () => ({
  maskToDataUrl: vi.fn(() => "data:image/png;base64,mask"),
}));
const stores: ProjectStore[] = [];
const pipelines: ThumbnailPipeline[] = [];
async function setup(project = createProject(), databaseName = crypto.randomUUID()) {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:test-thumbnail");
      static revokeObjectURL = vi.fn();
    },
  );
  const engine = new EditorEngine(project);
  const store = new ProjectStore(databaseName);
  stores.push(store);
  await store.save(project);
  const selection = {
    segment: vi.fn(),
    wand: vi.fn(),
    prepare: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  const download = vi.fn<(blob: Blob, name: string) => void>();
  const flush = vi.fn(async () => {});
  const thumbnailRenderer = new ThumbnailRenderer(async () => {
    throw new Error("Unexpected GPU adapter");
  });
  const renderThumbnail = vi.spyOn(thumbnailRenderer, "render").mockResolvedValue({
    blob: new Blob(["native-webp"], { type: "image/webp" }),
    width: 768,
    height: 768,
  });
  const thumbnails = new ThumbnailPipeline(store, { renderer: thumbnailRenderer });
  pipelines.push(thumbnails);
  const services = createEditorServices(engine, {
    thumbnails,
    store,
    selection: selection as unknown as SelectionClient,
    download,
    flush,
    render: async () => renderer as unknown as typeof import("@musart/render"),
  });
  return { engine, store, selection, download, flush, services, thumbnails, renderThumbnail };
}
afterEach(async () => {
  for (const pipeline of pipelines.splice(0)) await pipeline.dispose();
  for (const store of stores.splice(0)) await store.close();
  vi.unstubAllGlobals();
});
async function readText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unexpected test fixture reader result"));
    };
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
function sourceProject() {
  const asset: Asset = {
    id: "source",
    name: "Original",
    mime: "image/png",
    width: 100,
    height: 50,
    dataUrl: "data:image/png;base64,original",
  };
  const image = createLayer("image", {
    id: "image",
    assetId: asset.id,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
  });
  return createProject({ assets: { source: asset }, pages: [createPage({ layers: [image] })] });
}
const exportOptions: ExportOptions = { format: "png", scale: 2, quality: 1, allPages: false };
describe("project platform commands", () => {
  it("lists, creates and opens validated local projects after flushing pending changes", async () => {
    const { engine, services, store, flush } = await setup();
    expect(await services.listProjects()).toHaveLength(1);
    const original = engine.getSnapshot().project;
    await services.createProject({
      name: "New poster",
      width: 640,
      height: 960,
      background: "transparent",
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().project.pages[0]).toMatchObject({
      width: 640,
      height: 960,
      background: "transparent",
    });
    expect(await store.last()).toBe(engine.getSnapshot().project.id);
    await services.openProject(original.id);
    expect(engine.getSnapshot().project.id).toBe(original.id);
    expect(await store.last()).toBe(original.id);
    await expect(
      services.createProject({ name: "Invalid", width: -1, height: 10, background: "#ffffff" }),
    ).rejects.toThrow();
    expect(engine.getSnapshot().project.id).toBe(original.id);
  });
  it("persists canonical saves immediately and schedules versioned GPU thumbnails without base64 manifests", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    const { engine, services, store, thumbnails, renderThumbnail } = await setup();
    engine.execute({ type: "renameProject", name: "Saved title" });
    await services.saveProject();
    expect((await store.list())[0]).toMatchObject({ name: "Saved title" });
    expect(renderThumbnail).not.toHaveBeenCalled();
    await services.flushThumbnails();
    expect(renderThumbnail).toHaveBeenCalledOnce();
    const lease = await services.loadProjectThumbnails(engine.getSnapshot().project.id, [
      engine.getSnapshot().pageId,
    ]);
    expect(lease.items).toHaveLength(1);
    lease.release();
    renderThumbnail.mockRejectedValueOnce(new Error("GPU unavailable"));
    engine.execute({ type: "updatePage", patch: { background: "#ff0000" } });
    await services.saveProject();
    await thumbnails.flush();
    expect((await store.load(engine.getSnapshot().project.id)).pages[0]!.background).toBe(
      "#ff0000",
    );
  });
  it("duplicates independently and removes inactive or active projects without leaving an empty workspace", async () => {
    const { engine, services, store } = await setup();
    const original = engine.getSnapshot().project;
    await services.duplicateProject(original.id);
    const copy = (await store.list()).find((item) => item.id !== original.id)!;
    expect(copy.name).toBe(`${original.name} — copie`);
    expect(engine.getSnapshot().project.id).toBe(original.id);
    expect(await store.last()).toBe(original.id);
    await services.deleteProject(copy.id);
    expect(await store.list()).toHaveLength(1);
    expect(engine.getSnapshot().project.id).toBe(original.id);
    await services.duplicateProject(original.id);
    const next = (await store.list()).find((item) => item.id !== original.id)!;
    await services.deleteProject(original.id);
    expect(engine.getSnapshot().project.id).toBe(next.id);
    expect(await store.last()).toBe(next.id);
    await services.deleteProject(next.id);
    expect(engine.getSnapshot().project.name).toBe("Sans titre");
    expect(await store.list()).toHaveLength(1);
  });
  it("opens a portable file after validation, rejects oversized or unreadable input and exports portable originals", async () => {
    const { engine, services, download, store } = await setup();
    const project = createProject({ name: "Portable / original" });
    await services.openPortable(new File([serializeProject(project)], "project.musart"));
    expect(engine.getSnapshot().project.id).toBe(project.id);
    expect(await store.last()).toBe(project.id);
    await services.exportProject();
    const [blob, name] = download.mock.calls[0]!;
    expect(name).toBe("Portable - original.musart");
    expect(JSON.parse(await readText(blob))).toEqual(project);
    const tooLarge = new File(["x"], "too-large.musart");
    Object.defineProperty(tooLarge, "size", { value: 201 * 1024 * 1024 });
    await expect(services.openPortable(tooLarge)).rejects.toThrow("200 Mo");
    await expect(services.openPortable(new File(["invalid"], "invalid.musart"))).rejects.toThrow(
      "JSON",
    );
    class BrokenReader {
      onerror: (() => void) | null = null;
      readAsText() {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", BrokenReader);
    await expect(services.openPortable(new File([""], "broken.musart"))).rejects.toThrow("Lecture");
    class MalformedReader {
      result = new ArrayBuffer(4);
      onload: (() => void) | null = null;
      readAsText() {
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MalformedReader);
    await expect(services.openPortable(new File([""], "malformed.musart"))).rejects.toThrow(
      "Contenu",
    );
  });
  it("supports default lazy renderer and browser download adapters when none are injected", async () => {
    const { engine, store, selection } = await setup();
    const services = createEditorServices(engine, {
      store,
      selection: selection as unknown as SelectionClient,
    });
    expect(await services.loadProjectThumbnails(engine.getSnapshot().project.id)).toEqual({
      items: [],
      release: expect.any(Function),
    });
    services.subscribeProjectThumbnails(() => {})();
    renderer.renderComposition.mockResolvedValue({
      toDataURL: () => "data:image/webp;base64,preview",
    });
    await services.saveProject();
    await services.exportProject();
    expect(downloadBlob).toHaveBeenCalled();
  });
});
describe("asset and mask orchestration", () => {
  it("commits complete bulk imports and discards imports targeting a replaced project or page", async () => {
    const { engine, services } = await setup();
    const layer = createLayer("rectangle");
    vi.mocked(importBatch).mockResolvedValueOnce({ type: "addLayers", layers: [layer] });
    await services.importFiles([new File([""], "photo.png")]);
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
    let release!: (command: { type: "addLayers"; layers: (typeof layer)[] }) => void;
    vi.mocked(importBatch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = services.importFiles([]);
    engine.load(createProject());
    release({ type: "addLayers", layers: [] });
    await expect(pending).rejects.toThrow("composition a changé");
    vi.mocked(importBatch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pendingPage = services.importFiles([]);
    engine.execute({ type: "addPage" });
    release({ type: "addLayers", layers: [] });
    await expect(pendingPage).rejects.toThrow("composition a changé");
  });
  it("prepares segmentation explicitly and applies an alpha mask with a single undoable transaction", async () => {
    const { engine, services, selection } = await setup(sourceProject());
    await services.prepareSegmentation();
    expect(selection.prepare).toHaveBeenCalledTimes(1);
    selection.segment.mockResolvedValue({ data: new Uint8ClampedArray(8), width: 2, height: 1 });
    await services.selectImagePoint("image", 100, -20, "segment", 16);
    expect(selection.segment).toHaveBeenCalledWith("data:image/png;base64,original", 50, 0);
    const snapshot = engine.getSnapshot();
    const mask = snapshot.project.pages[0]!.layers[0]!.mask;
    expect(mask).toMatchObject({ enabled: true, inverted: false });
    expect(mask!.assetId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    );
    expect(snapshot.project.assets[mask!.assetId!]).toMatchObject({
      name: "Masque — Image",
      width: 2,
      height: 1,
      mime: "image/png",
    });
    engine.undo();
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toBeNull();
    expect(Object.keys(engine.getSnapshot().project.assets)).toEqual(["source"]);
  });
  it("accepts a persistent wand selection without applying an automatic mask", async () => {
    const { services, engine } = await setup(sourceProject());
    const begin = vi.spyOn(services.pixelSelection!, "begin").mockResolvedValue();
    const accept = vi.spyOn(services.pixelSelection!, "accept").mockResolvedValue();
    await services.selectImagePoint("image", 10000, 10000, "wand", 24);
    expect(begin).toHaveBeenCalledWith("image", 10000, 10000, 24);
    expect(accept).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toBeNull();
  });
  it("rejects non-image or locked targets before running models and discards stale masks", async () => {
    const { engine, services, selection } = await setup(sourceProject());
    await expect(services.selectImagePoint("missing", 0, 0, "segment", 16)).rejects.toThrow(
      "calque image",
    );
    const rectangle = createLayer("rectangle");
    engine.execute({ type: "addLayers", layers: [rectangle] });
    await expect(services.selectImagePoint(rectangle.id, 0, 0, "segment", 16)).rejects.toThrow(
      "calque image",
    );
    engine.execute({ type: "updateLayers", ids: ["image"], patch: { locked: true } });
    await expect(services.selectImagePoint("image", 0, 0, "segment", 16)).rejects.toThrow(
      "verrouillé",
    );
    expect(selection.segment).not.toHaveBeenCalled();
    engine.execute({ type: "updateLayers", ids: ["image"], patch: { locked: false } });
    let release!: (mask: { data: Uint8ClampedArray; width: number; height: number }) => void;
    selection.segment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = services.selectImagePoint("image", 0, 0, "segment", 16);
    engine.execute({ type: "deleteLayers", ids: ["image"] });
    release({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    await expect(pending).rejects.toThrow("cible a changé");
  });
});
describe("high-resolution file export", () => {
  it("exports the active composition in the requested format with an appropriate extension", async () => {
    const { services, download } = await setup();
    const blob = new Blob(["pixels"], { type: "image/jpeg" });
    renderer.exportComposition.mockResolvedValue(blob);
    await services.exportImage({ ...exportOptions, format: "jpeg" });
    expect(download).toHaveBeenLastCalledWith(blob, "Composition 1.jpg");
    expect(renderer.exportComposition).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Composition 1" }),
      {},
      expect.objectContaining({ scale: 2, format: "jpeg" }),
    );
  });
  it("packages every composition in a ZIP with deterministic numbering and its real image bytes", async () => {
    const project = createProject({
      pages: [createPage({ name: "Cover" }), createPage({ name: "Study" })],
    });
    const { services, download } = await setup(project);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const blob = new Blob([bytes], { type: "image/png" });
    Object.defineProperty(blob, "arrayBuffer", { value: async () => bytes.buffer });
    renderer.exportComposition.mockResolvedValue(blob);
    await services.exportImage({ ...exportOptions, allPages: true });
    const [zip, name] = download.mock.calls[0]!;
    expect(name).toBe(`${project.name}.zip`);
    expect(zip.type).toBe("application/zip");
    const dataUrl = await readDataUrl(zip);
    const zipBytes = Uint8Array.from(atob(dataUrl.split(",")[1]!), (character) =>
      character.charCodeAt(0),
    );
    const { unzipSync } = await import("fflate");
    const files = unzipSync(zipBytes);
    expect(Object.keys(files)).toEqual(["01-Cover.png", "02-Study.png"]);
    expect(files["01-Cover.png"]).toEqual(bytes);
    expect(files["02-Study.png"]).toEqual(bytes);
  });
});
function paste(target: EventTarget, data?: { files?: File[]; text?: string }) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  if (data)
    Object.defineProperty(event, "clipboardData", {
      value: { files: data.files ?? [], getData: () => data.text ?? "" },
    });
  target.dispatchEvent(event);
  return event;
}
describe("shared clipboard command path", () => {
  it("creates editable text, imports image files and removes document listeners on disposal", async () => {
    const engine = new EditorEngine();
    const importFiles = vi.fn(async () => {});
    const onError = vi.fn();
    const dispose = installClipboard(engine, { importFiles }, onError);
    expect(paste(document, { text: "A title\nwith two lines" }).defaultPrevented).toBe(true);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({
      kind: "text",
      text: "A title\nwith two lines",
      height: 100,
      fontSize: 40,
    });
    const file = new File([""], "photo.png");
    expect(paste(document, { files: [file], text: "Ignored text" }).defaultPrevented).toBe(true);
    expect(importFiles).toHaveBeenCalledWith([file]);
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
    dispose();
    const before = engine.getSnapshot();
    paste(document, { text: "After dispose" });
    expect(engine.getSnapshot()).toBe(before);
  });
  it("preserves native input paste, ignores absent clipboard data and surfaces import or command failures", async () => {
    const engine = new EditorEngine();
    const importFiles = vi.fn(async () => {
      throw new Error("Bad image");
    });
    const onError = vi.fn();
    const dispose = installClipboard(engine, { importFiles }, onError);
    const input = document.createElement("input");
    document.body.append(input);
    expect(paste(input, { text: "Typing" }).defaultPrevented).toBe(false);
    input.remove();
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    expect(paste(editable, { text: "Typing" }).defaultPrevented).toBe(false);
    editable.remove();
    expect(paste(document).defaultPrevented).toBe(false);
    expect(paste(document, { text: "  " }).defaultPrevented).toBe(false);
    paste(document, { files: [new File([""], "bad.png")] });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Bad image" }));
    vi.spyOn(engine, "execute").mockImplementationOnce(() => {
      throw new Error("Invalid command");
    });
    paste(document, { text: "Title" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid command" }));
    dispose();
  });
});

it("uses persistent UUIDs for new, duplicate and colliding portable projects without overwriting inactive documents", async () => {
  const { services, store, engine } = await setup();
  const inactive = createProject({ id: "project-1", name: "Keep me" });
  await store.save(inactive);
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ] as const;
  const uuid = vi.spyOn(crypto, "randomUUID");
  uuid.mockReturnValueOnce(ids[0]);
  await services.createProject({
    name: "UUID project",
    width: 100,
    height: 100,
    background: "#ffffff",
  });
  expect(engine.getSnapshot().project.id).toBe(ids[0]);
  uuid.mockReturnValueOnce(ids[1]);
  await services.duplicateProject(inactive.id);
  expect((await store.load(ids[1])).name).toContain("copie");
  uuid.mockReturnValueOnce(ids[2]);
  await services.openPortable(new File([serializeProject(inactive)], "existing.musart"));
  expect(engine.getSnapshot().project.id).toBe(ids[2]);
  expect((await store.load(inactive.id)).name).toBe("Keep me");
});
it("adapts paginated metadata, rename, storage insights, history clearing and thumbnail notifications", async () => {
  const { services, store, engine, thumbnails } = await setup();
  const original = engine.getSnapshot().project,
    other = createProject({ name: "Other" });
  await store.save(other);
  expect((await services.listProjectPage({ limit: 1 })).projects).toHaveLength(1);
  await services.renameProject(other.id, "Inactive renamed");
  expect((await store.load(other.id)).name).toBe("Inactive renamed");
  const session = getAnimationSession(engine);
  session.attach(store.history, vi.fn());
  await session.flush();
  await services.renameProject(original.id, "Active renamed");
  await session.flush();
  expect(engine.getSnapshot().project.name).toBe("Active renamed");
  vi.spyOn(store, "estimateOriginStorage").mockResolvedValue({
    approximate: true,
    usage: 100,
    quota: 1000,
  });
  expect(await services.projectInsights(original.id)).toMatchObject({
    projectId: original.id,
    origin: { approximate: true, usage: 100 },
  });
  await services.clearHistory(original.id);
  expect(session.read().events).toBe(0);
  await services.clearHistory(other.id);
  expect((await store.history.info(other.id))!.count).toBe(0);
  const listener = vi.fn(),
    stop = services.subscribeProjectThumbnails(listener);
  thumbnails.schedule(engine.getSnapshot().project);
  await services.flushThumbnails();
  expect(listener).toHaveBeenCalledWith(original.id);
  stop();
  await session.dispose();
});
it("prepares true cropped previews through the bounded shared pipeline and rejects stale frames", async () => {
  const { services, engine, thumbnails } = await setup(sourceProject());
  const signal = new AbortController(),
    render = vi.spyOn(thumbnails, "preview").mockResolvedValue({
      blob: new Blob(["preview"], { type: "image/webp" }),
      width: 64,
      height: 32,
    });
  engine.select(["image"]);
  await services.previewExport!({ selection: ["image"], edge: 64 }, signal.signal);
  const first = render.mock.calls[0]!;
  expect(first[1]).toMatchObject({ width: 200, height: 100, background: "transparent" });
  expect(first[3]).toMatchObject({ edge: 64, signal: signal.signal });
  expect(first[3]!.isCurrent!()).toBe(true);
  engine.select([]);
  expect(first[3]!.isCurrent!()).toBe(true);
  engine.execute({ type: "addLayers", layers: [createLayer("rectangle", { id: "unrelated" })] });
  engine.execute({ type: "updateLayers", ids: ["unrelated"], patch: { fill: "#123456" } });
  expect(first[3]!.isCurrent!()).toBe(true);
  await services.previewExport!({ selection: ["image"], edge: 64 });
  expect(render.mock.calls[1]![0]).toBe(first[0]);
  engine.execute({ type: "updateLayers", ids: ["image"], patch: { width: 220 } });
  expect(first[3]!.isCurrent!()).toBe(false);
  await services.previewExport!({ all: true });
  expect(render.mock.calls[2]![0]).not.toBe(first[0]);
  expect(render.mock.calls[2]![1].background).not.toBe("transparent");
  await expect(services.previewExport!({ edge: 1 })).rejects.toThrow("size");
  await expect(services.previewExport!({ selection: ["missing"] })).rejects.toThrow("missing");
  signal.abort();
  await expect(services.previewExport!({}, signal.signal)).rejects.toThrow();
  expect(render).toHaveBeenCalledTimes(3);
});
it("exports only selected layers with their cropped bounds and preserves the original document", async () => {
  const { services, engine, download } = await setup(sourceProject());
  const before = engine.getSnapshot().project;
  renderer.exportComposition.mockClear();
  renderer.exportComposition.mockResolvedValue(new Blob(["encoded"], { type: "image/png" }));
  engine.select(["image"]);
  await services.exportImage({
    scale: 2,
    format: "png",
    quality: 1,
    allPages: false,
    selectionOnly: true,
  });
  expect(renderer.exportComposition.mock.calls[0]![0]).toMatchObject({
    width: 200,
    height: 100,
    background: "transparent",
  });
  expect(download).toHaveBeenCalledWith(expect.any(Blob), "Image.png");
  expect(engine.getSnapshot().project).toBe(before);
  engine.select([]);
  await expect(
    services.exportImage({
      scale: 1,
      format: "png",
      quality: 1,
      allPages: false,
      selectionOnly: true,
    }),
  ).rejects.toThrow("empty");
  expect(renderer.exportComposition).toHaveBeenCalledTimes(1);
});

it("rejects a queued export after the engine changes before React can publish new props", async () => {
  const { services, engine, download } = await setup(sourceProject());
  const before = engine.getSnapshot();
  const scope = {
    page: before.project.pages[0]!,
    revision: before.revision,
    selection: before.selection,
  };
  renderer.exportComposition.mockClear();
  const queued = () => services.exportImage(exportOptions, scope);
  engine.load(sourceProject());
  await expect(queued()).rejects.toThrow("target has changed");
  expect(renderer.exportComposition).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
});
it("editor save and active rename retain the loaded session's write revision", async () => {
  const name = crypto.randomUUID(),
    d = await setup(createProject(), name),
    other = new ProjectStore(name);
  try {
    const project = d.engine.getSnapshot().project;
    await other.save({ ...project, name: "Concurrent session" });
    await expect(d.services.saveProject()).rejects.toMatchObject({ code: "STALE_PROJECT_WRITE" });
    await d.services.duplicateProject(project.id);
    await expect(d.services.saveProject()).rejects.toMatchObject({ code: "STALE_PROJECT_WRITE" });
    await expect(d.services.renameProject(project.id, "Stale rename")).rejects.toMatchObject({
      code: "STALE_PROJECT_WRITE",
    });
    expect((await other.load(project.id)).name).toBe("Concurrent session");
  } finally {
    await other.close();
  }
});
