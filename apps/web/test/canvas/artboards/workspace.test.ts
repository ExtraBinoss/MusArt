import { expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createWorkspace, createArtboardView } from "../../../src/canvas/artboards/workspace";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";

it("caches metadata, follows active preview dimensions and maps the same view without resetting it", () => {
  let preview = EMPTY_PREVIEW_SOURCE.read();
  const a = createPage({ width: 200, height: 160 }),
    b = createPage({ width: 300, height: 100 });
  const engine = new EditorEngine(createProject({ pages: [a, b] })),
    controller = new SceneController(engine, { ...EMPTY_PREVIEW_SOURCE, read: () => preview }),
    workspace = createWorkspace(engine, controller),
    source = { read: () => ({ x: 10, y: 20, zoom: 2 }), subscribe: vi.fn(() => vi.fn()) },
    view = createArtboardView(workspace, source);
  const first = workspace.read();
  expect(workspace.read()).toBe(first);
  engine.execute({ type: "updatePage", patch: { background: "#123456" } });
  expect(workspace.read()).toBe(first);
  expect(view.read()).toEqual({ x: -418, y: 20, zoom: 2 });
  engine.setPage(b.id);
  expect(workspace.read()).toBe(first);
  expect(view.read()).toEqual({ x: 338, y: -40, zoom: 2 });
  preview = { target: "page", patch: { width: 400, name: "Preview" } };
  expect(workspace.read().width).toBe(728);
  expect(workspace.read().boards[1]!.name).toBe("Preview");
  const listener = vi.fn();
  view.subscribe(listener);
  expect(source.subscribe).toHaveBeenCalledWith(listener);
});

it("presents deleted historical pages in the canonical active artboard slot without changing the document", () => {
  const a = createPage({ id: "cover", width: 200, height: 160 }),
    b = createPage({ id: "story", width: 300, height: 100 }),
    engine = new EditorEngine(createProject({ pages: [a, b] })),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    workspace = createWorkspace(engine, controller),
    playback = createPlaybackSource(engine),
    source = { read: () => ({ x: 10, y: 20, zoom: 2 }), subscribe: vi.fn(() => vi.fn()) },
    view = createArtboardView(workspace, source);
  engine.setPage(b.id);
  const snapshot = engine.getSnapshot();
  playback.set({
    page: createPage({
      id: "deleted-historical-page",
      name: "Historical",
      width: 400,
      height: 240,
    }),
    assets: {},
  });
  expect(workspace.read().boards[1]).toEqual(
    expect.objectContaining({ id: b.id, name: "Historical", width: 400, height: 240 }),
  );
  expect(view.read()).toEqual({ x: 338, y: 20, zoom: 2 });
  expect(engine.getSnapshot()).toBe(snapshot);
  playback.set(null);
  expect(workspace.read().boards[1]).toEqual(
    expect.objectContaining({ id: b.id, name: b.name, width: 300, height: 100 }),
  );
  expect(view.read()).toEqual({ x: 338, y: -40, zoom: 2 });
});
