import { act, renderHook } from "@testing-library/react";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { expect, test, vi } from "vitest";
import { useDocumentSnapshot } from "../../../src/state/session/use-document-snapshot";

test("document consumers retain selection-only snapshots, follow real edits and rebind on page/load", () => {
  const first = createLayer("rectangle", { id: "first" }),
    second = createLayer("text", { id: "second" });
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "a", layers: [first] }), createPage({ id: "b", layers: [second] })],
    }),
  );
  const view = renderHook(({ selection }) => useDocumentSnapshot(engine, selection), {
    initialProps: { selection: false },
  });
  const original = view.result.current;
  act(() => engine.select([first.id]));
  expect(engine.getSnapshot().selection).toEqual([first.id]);
  expect(view.result.current).toBe(original);
  view.rerender({ selection: true });
  expect(view.result.current).toBe(engine.getSnapshot());
  act(() => engine.select([]));
  expect(view.result.current.selection).toEqual([]);
  view.rerender({ selection: false });
  act(() => engine.execute({ type: "updatePage", patch: { name: "Updated" } }));
  expect(view.result.current.project.pages[0]!.name).toBe("Updated");
  act(() => engine.setPage("b"));
  expect(view.result.current.pageId).toBe("b");
  const current = view.result.current;
  act(() => engine.select([second.id]));
  expect(view.result.current).toBe(current);
  act(() => engine.load(createProject({ id: "replacement", pages: [createPage({ id: "b" })] })));
  expect(view.result.current.project.id).toBe("replacement");
  expect(view.result.current).toBe(engine.getSnapshot());
});

test("unmount releases the document subscription", () => {
  const engine = new EditorEngine(createProject());
  const subscribe = engine.subscribe;
  let count = 0;
  vi.spyOn(engine, "subscribe").mockImplementation((listener) => {
    count++;
    const stop = subscribe(listener);
    return () => {
      count--;
      stop();
    };
  });
  const view = renderHook(() => useDocumentSnapshot(engine));
  expect(count).toBe(1);
  view.unmount();
  expect(count).toBe(0);
});
