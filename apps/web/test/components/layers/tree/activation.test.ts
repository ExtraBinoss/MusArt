import { expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  activateLayerPage,
  resolveLayerPage,
  sameLayerContainer,
  useOpenLayerPage,
} from "../../../../src/components/layers/tree/activation";
test("activates the real artboard without a document transaction and rejects stale snapshots", () => {
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [createLayer("rectangle")] }), createPage()] }),
    ),
    snapshot = engine.getSnapshot(),
    page = snapshot.project.pages[1]!;
  engine.select([snapshot.project.pages[0]!.layers[0]!.id]);
  expect(activateLayerPage(engine, page)).toBe(true);
  expect(engine.getSnapshot()).toMatchObject({ pageId: page.id, selection: [], canUndo: false });
  const active = engine.getSnapshot();
  expect(activateLayerPage(engine, page)).toBe(true);
  expect(engine.getSnapshot()).toBe(active);
  engine.load(structuredClone(active.project));
  const replacement = engine.getSnapshot();
  expect(activateLayerPage(engine, page)).toBe(false);
  expect(engine.getSnapshot()).toBe(replacement);
});
test("rejects a reentrant replacement with the same page ID before a caller can select its source", () => {
  const engine = new EditorEngine(createProject({ pages: [createPage(), createPage()] })),
    original = engine.getSnapshot().project,
    target = original.pages[1]!,
    replacement = structuredClone(original);
  replacement.id = "replacement-project";
  let loaded = false;
  const stop = engine.subscribe(() => {
    if (!loaded && engine.getSnapshot().pageId === target.id) {
      loaded = true;
      engine.load(replacement);
      engine.setPage(target.id);
    }
  });
  expect(activateLayerPage(engine, target)).toBe(false);
  expect(engine.getSnapshot()).toMatchObject({
    pageId: target.id,
    project: { id: replacement.id },
    selection: [],
  });
  stop();
});

test("only immutable metadata updates preserve a retained layer container", () => {
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [createLayer("rectangle")] })] }),
    ),
    page = engine.getSnapshot().project.pages[0]!;
  engine.execute({ type: "updatePage", patch: { rulers: true } });
  const metadata = engine.getSnapshot().project.pages[0]!;
  expect(metadata).not.toBe(page);
  expect(metadata.layers).toBe(page.layers);
  expect(sameLayerContainer(page, metadata)).toBe(true);
  expect(sameLayerContainer(page, { ...metadata })).toBe(false);
  expect(resolveLayerPage(engine, page)).toBe(metadata);
  expect(activateLayerPage(engine, page)).toBe(true);
  engine.execute({ type: "updateLayers", ids: [page.layers[0]!.id], patch: { visible: false } });
  expect(resolveLayerPage(engine, page)).toBeNull();
  const edited = engine.getSnapshot().project.pages[0]!;
  engine.load(engine.getSnapshot().project);
  expect(resolveLayerPage(engine, edited)).toBeNull();
  expect(activateLayerPage(engine, edited)).toBe(false);
});

test("reentrant metadata during artboard activation keeps identical immutable layer ownership", () => {
  const engine = new EditorEngine(createProject({ pages: [createPage(), createPage()] })),
    page = engine.getSnapshot().project.pages[1]!;
  let changed = false;
  const stop = engine.subscribe(() => {
    if (!changed && engine.getSnapshot().pageId === page.id) {
      changed = true;
      engine.execute({ type: "updatePage", patch: { rulers: true } });
    }
  });
  expect(activateLayerPage(engine, page)).toBe(true);
  expect(resolveLayerPage(engine, page)?.rulers).toBe(true);
  stop();
});

test("only an open editor subscribes and follows canonical metadata; replacements invalidate it", () => {
  const engine = new EditorEngine(createProject()),
    page = engine.getSnapshot().project.pages[0]!,
    subscribe = engine.subscribe,
    release = vi.fn();
  const observed = vi.spyOn(engine, "subscribe").mockImplementation((listener) => {
    const stop = subscribe(listener);
    return () => {
      release();
      stop();
    };
  });
  const view = renderHook(({ open }) => useOpenLayerPage(engine, page, open), {
    initialProps: { open: false },
  });
  expect(observed).not.toHaveBeenCalled();
  act(() => engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(view.result.current).toBe(page);
  view.rerender({ open: true });
  expect(observed).toHaveBeenCalledOnce();
  expect(view.result.current).toBe(engine.getSnapshot().project.pages[0]);
  act(() => engine.execute({ type: "updatePage", patch: { rulers: false } }));
  expect(view.result.current).toBe(engine.getSnapshot().project.pages[0]);
  act(() => engine.load(engine.getSnapshot().project));
  expect(view.result.current).toBeNull();
  view.rerender({ open: false });
  expect(release).toHaveBeenCalledOnce();
  expect(view.result.current).toBe(page);
  view.unmount();
});
