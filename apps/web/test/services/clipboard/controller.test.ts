import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine, copyContent } from "@musart/core";
import {
  ClipboardController,
  createClipboardController,
  nativeClipboardShortcut,
  isMusArtClipboardText,
} from "../../../src/services/clipboard/controller";
import { installClipboard } from "../../../src/services/session/editor-services";
import { clipboardPreferences } from "../../../src/state/clipboard/preferences";
import { keybindings } from "../../../src/state/keybindings/store";
function fixture() {
  const layer = createLayer("rectangle", { id: "item", x: 20, y: 30, width: 100, height: 80 });
  const first = createPage({ id: "first", width: 400, height: 300, layers: [layer] });
  const second = createPage({ id: "second", width: 800, height: 600 });
  const engine = new EditorEngine(createProject({ pages: [first, second] }));
  engine.select([layer.id]);
  return { layer, first, second, engine, controller: createClipboardController(engine) };
}
function clipboardEvent(type: "copy" | "paste", text = "", target: EventTarget = document) {
  const clipboardData = { files: [] as File[], setData: vi.fn(), getData: vi.fn(() => text) };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  target.dispatchEvent(event);
  return { event, clipboardData };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  keybindings.reset();
  clipboardPreferences.update(true);
  document.body.replaceChildren();
  localStorage.clear();
});
it("native copy/paste events transfer actual portable JSON across pages and restore one undo", () => {
  const d = fixture(),
    onError = vi.fn(),
    stop = d.controller.retain({ enabled: () => true, onError });
  expect(createClipboardController(d.engine)).toBe(d.controller);
  const copied = clipboardEvent("copy");
  expect(copied.event.defaultPrevented).toBe(true);
  const text = copied.clipboardData.setData.mock.calls[0]![1] as string;
  expect(JSON.parse(text).selection).toEqual([d.layer.id]);
  d.engine.setPage(d.second.id);
  const before = d.engine.getSnapshot();
  const paste = clipboardEvent("paste", text);
  expect(paste.event.defaultPrevented).toBe(true);
  expect(d.engine.getSnapshot().project.pages[1]!.layers[0]).toMatchObject({
    x: 350,
    y: 260,
    width: 100,
    height: 80,
  });
  expect(d.engine.getSnapshot().selection).toHaveLength(1);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(onError).not.toHaveBeenCalled();
  stop();
  expect(clipboardEvent("copy").event.defaultPrevented).toBe(false);
});
it("tracks the pointer imperatively and places pasted bounds at its active-artboard local position", () => {
  const d = fixture(),
    stop = d.controller.retain({ enabled: () => true, onError: vi.fn() });
  const text = copyContent(d.engine.getSnapshot());
  const board = document.createElement("div");
  board.className = "canvas-artboard-editor editor-canvas";
  board.dataset.artboardId = d.first.id;
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 100,
    width: 200,
    height: 150,
    right: 300,
    bottom: 250,
  } as DOMRect);
  document.body.append(board);
  board.dispatchEvent(
    new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }),
  );
  clipboardEvent("paste", text);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[1]).toMatchObject({ x: 150, y: 160 });
  board.dispatchEvent(
    new PointerEvent("pointermove", { clientX: 1000, clientY: 1000, bubbles: true }),
  );
  clipboardEvent("paste", text);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]).toMatchObject({ x: 150, y: 110 });
  stop();
});
it("leaves native text editing, unrelated text, disabled sessions, consumed events and removed bindings alone", () => {
  const d = fixture(),
    onError = vi.fn();
  let enabled = false;
  const stop = d.controller.retain({ enabled: () => enabled, onError });
  expect(clipboardEvent("copy").event.defaultPrevented).toBe(false);
  enabled = true;
  const input = document.createElement("input");
  document.body.append(input);
  expect(clipboardEvent("copy", "", input).event.defaultPrevented).toBe(false);
  const before = d.engine.getSnapshot();
  expect(clipboardEvent("paste", "ordinary text").event.defaultPrevented).toBe(false);
  expect(d.engine.getSnapshot()).toBe(before);
  keybindings.assign("action:copy", []);
  expect(clipboardEvent("copy").event.defaultPrevented).toBe(false);
  keybindings.reset();
  d.engine.select([]);
  expect(clipboardEvent("copy").event.defaultPrevented).toBe(false);
  const event = new Event("paste", { cancelable: true });
  event.preventDefault();
  document.dispatchEvent(event);
  expect(onError).not.toHaveBeenCalled();
  stop();
});
it("surfaces invalid native MusArt paste and real serialization failures without changing the document", () => {
  const d = fixture(),
    onError = vi.fn(),
    stop = d.controller.retain({ enabled: () => true, onError });
  const before = d.engine.getSnapshot();
  expect(
    clipboardEvent("paste", '{"format":"musart.clipboard","version":42}').event.defaultPrevented,
  ).toBe(true);
  expect(onError).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot()).toBe(before);
  const snapshot = vi
    .spyOn(d.engine, "getSnapshot")
    .mockReturnValue({ ...before, pageId: "missing" });
  expect(clipboardEvent("copy").event.defaultPrevented).toBe(true);
  expect(onError).toHaveBeenCalledTimes(2);
  snapshot.mockRestore();
  stop();
});
it("alternate shortcut/API actions write real clipboard text, copy full compositions and reject read/write failures", async () => {
  const d = fixture();
  const writeText = vi.fn(async (_text: string) => {}),
    readText = vi.fn(async () => copyContent(d.engine.getSnapshot()));
  vi.stubGlobal("navigator", { clipboard: { writeText, readText } });
  await d.controller.copy();
  expect(JSON.parse(writeText.mock.calls[0]![0]!).kind).toBe("selection");
  await d.controller.copy(true);
  expect(JSON.parse(writeText.mock.calls[1]![0]!).kind).toBe("composition");
  await d.controller.paste();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  readText.mockRejectedValueOnce(new Error("denied"));
  await expect(d.controller.paste()).rejects.toThrow();
  writeText.mockRejectedValueOnce(new Error("denied"));
  await expect(d.controller.copy()).rejects.toThrow();
  vi.stubGlobal("navigator", {});
  await expect(d.controller.copy()).rejects.toThrow();
  await expect(d.controller.paste()).rejects.toThrow();
  d.engine.select([]);
  await expect(d.controller.copy()).rejects.toThrow();
});
it("rejects stale asynchronous reads and foreign metadata-only images without partial writes", async () => {
  const d = fixture(),
    text = copyContent(d.engine.getSnapshot());
  let resolve!: (text: string) => void;
  vi.stubGlobal("navigator", {
    clipboard: {
      readText: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    },
  });
  const pasting = d.controller.paste();
  d.engine.setPage(d.second.id);
  resolve(text);
  await expect(pasting).rejects.toThrow();
  expect(d.engine.getSnapshot().project.pages[1]!.layers).toHaveLength(0);
  const image = createLayer("image", { id: "image", assetId: "asset" });
  const source = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [image] })],
      assets: {
        asset: {
          id: "asset",
          name: "Photo",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,AAAA",
        },
      },
    }),
  );
  source.select([image.id]);
  const omitted = copyContent(source.getSnapshot(), { includeImages: false });
  vi.stubGlobal("navigator", { clipboard: { readText: async () => omitted } });
  const before = d.engine.getSnapshot();
  await expect(d.controller.paste()).rejects.toThrow();
  expect(d.engine.getSnapshot()).toBe(before);
});
it("recognizes default native clipboard keys while alternate, shifted and other commands remain registry-dispatched", () => {
  expect(
    nativeClipboardShortcut(
      "action:copy",
      new KeyboardEvent("keydown", { key: "c", ctrlKey: true }),
    ),
  ).toBe(true);
  expect(
    nativeClipboardShortcut(
      "action:paste",
      new KeyboardEvent("keydown", { key: "v", metaKey: true }),
    ),
  ).toBe(true);
  for (const event of [
    { key: "x", ctrlKey: true },
    { key: "c" },
    { key: "c", ctrlKey: true, shiftKey: true },
    { key: "c", ctrlKey: true, altKey: true },
  ])
    expect(nativeClipboardShortcut("action:copy", new KeyboardEvent("keydown", event))).toBe(false);
  expect(
    nativeClipboardShortcut(
      "action:save",
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true }),
    ),
  ).toBe(false);
  expect(new ClipboardController(fixture().engine)).toBeInstanceOf(ClipboardController);
});
it("rejects a clipboard read completed after its final editor owner releases it", async () => {
  const d = fixture(),
    text = copyContent(d.engine.getSnapshot());
  let complete!: (value: string) => void;
  vi.stubGlobal("navigator", {
    clipboard: {
      readText: () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    },
  });
  const stop = d.controller.retain({ enabled: () => true, onError: vi.fn() });
  const before = d.engine.getSnapshot(),
    pending = d.controller.paste();
  stop();
  stop();
  complete(text);
  await expect(pending).rejects.toThrow();
  expect(d.engine.getSnapshot()).toBe(before);
  await expect(d.controller.paste()).rejects.toThrow();
  const resume = d.controller.retain({ enabled: () => true, onError: vi.fn() });
  vi.stubGlobal("navigator", { clipboard: { readText: async () => text } });
  await d.controller.paste();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  resume();
});
it("native paste accepts valid reformatted portable JSON regardless of property order", () => {
  const d = fixture(),
    stop = d.controller.retain({ enabled: () => true, onError: vi.fn() });
  const { format, ...payload } = JSON.parse(copyContent(d.engine.getSnapshot()));
  const text = `  ${JSON.stringify({ ...payload, format }, null, 2)}`;
  expect(text.indexOf('"format"')).toBeGreaterThan(256);
  expect(clipboardEvent("paste", text).event.defaultPrevented).toBe(true);
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  stop();
});
it("claims portable graphs before the earlier real text/file adapter without duplicate imports", async () => {
  const d = fixture(),
    onError = vi.fn(),
    importFiles = vi.fn(async (_files: File[]) => {});
  // Runtime installs this generic adapter before React mounts useShortcuts.
  const generic = installClipboard(d.engine, { importFiles }, onError);
  const structured = d.controller.retain({ enabled: () => true, onError });
  try {
    const text = copyContent(d.engine.getSnapshot());
    d.engine.setPage(d.second.id);
    const before = d.engine.getSnapshot();
    expect(clipboardEvent("paste", text).event.defaultPrevented).toBe(true);
    const after = d.engine.getSnapshot();
    expect(after.project.pages[1]!.layers).toHaveLength(1);
    expect(after.project.pages[1]!.layers[0]!.kind).toBe("rectangle");
    expect(after.revision).toBe(before.revision + 1);
    expect(importFiles).not.toHaveBeenCalled();
    d.engine.undo();
    expect(d.engine.getSnapshot().project).toBe(before.project);
    const plain = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(plain, "clipboardData", {
      value: { files: [], getData: () => "Plain text" },
    });
    document.dispatchEvent(plain);
    expect(d.engine.getSnapshot().project.pages[1]!.layers[0]).toMatchObject({
      kind: "text",
      text: "Plain text",
    });
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const image = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(image, "clipboardData", { value: { files: [file], getData: () => "" } });
    document.dispatchEvent(image);
    await Promise.resolve();
    expect(importFiles).toHaveBeenCalledExactlyOnceWith([file]);
    const invalid = clipboardEvent("paste", '{"format":"musart.clipboard","version":42}');
    expect(invalid.event.defaultPrevented).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    const unchanged = d.engine.getSnapshot();
    keybindings.assign("action:paste", []);
    expect(clipboardEvent("paste", text).event.defaultPrevented).toBe(false);
    expect(d.engine.getSnapshot()).toBe(unchanged);
  } finally {
    structured();
    generic();
  }
  expect(isMusArtClipboardText("plain text")).toBe(false);
  expect(isMusArtClipboardText('{"other":"musart.clipboard"}')).toBe(false);
});
