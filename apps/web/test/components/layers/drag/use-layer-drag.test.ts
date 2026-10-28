import { expect, test, vi } from "vitest";
import { act, renderHook, fireEvent } from "@testing-library/react";
import type { DragEvent } from "react";
import { createLayer, createPage } from "@musart/core";
import { setup } from "../../../support/ui";
import { useLayerDrag } from "../../../../src/components/layers/drag/use-layer-drag";

function fixture() {
  const d = setup();
  const page = d.engine.getSnapshot().project.pages[0]!;
  const transfer = {
    setData: vi.fn(),
    getData: () => d.rectangle.id,
    effectAllowed: "",
    dropEffect: "",
  };
  const event = {
    clientX: 20,
    clientY: 5,
    altKey: false,
    preventDefault: vi.fn(),
    dataTransfer: transfer,
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 40 }) },
  } as unknown as DragEvent<HTMLElement>;
  const hook = renderHook(({ current }) => useLayerDrag(current, d.engine, d.run), {
    initialProps: { current: page },
  });
  return { ...d, ...hook, event, page, transfer };
}
test("projects on hover and only commits one semantic command on drop", () => {
  const d = fixture();
  const execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.text));
  expect(d.result.current.target).toEqual({ id: d.text.id, position: "before" });
  expect(d.result.current.dragging).toBe(d.rectangle.id);
  const projected = d.result.current.layers;
  act(() => d.result.current.over(d.event, d.text));
  expect(d.result.current.layers).toBe(projected);
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => d.result.current.drop(d.event, d.text));
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: "reorderLayer", id: d.rectangle.id }),
  );
  expect(d.result.current.target).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toEqual(d.page.layers);
});
test("Escape, invalid targets, dragend and concurrent document changes restore visual order and reject late drops", () => {
  const d = fixture();
  const execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.over(d.event, d.text));
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.rectangle));
  expect(d.transfer.dropEffect).toBe("none");
  act(() => d.result.current.over(d.event, d.text));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(d.result.current.layers).toBe(d.page.layers);
  act(() => d.result.current.drop(d.event, d.text));
  expect(execute).not.toHaveBeenCalled();
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.text));
  d.rerender({ current: { ...d.page, layers: [...d.page.layers, createLayer("group")] } });
  expect(d.result.current.target).toBeNull();
  act(() => d.result.current.over(d.event, d.text));
  act(() => d.result.current.drop(d.event, d.text));
  expect(execute).not.toHaveBeenCalled();
  act(() => d.result.current.cancel());
  fireEvent.keyDown(window, { key: "a" });
  d.unmount();
});

test("tree gaps during row settlement accept the pending candidate and ignore a second bubbled drop", () => {
  const d = fixture(),
    execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.text));
  act(() => d.result.current.overTree(d.event));
  expect(d.event.preventDefault).toHaveBeenCalled();
  act(() => d.result.current.drop(d.event));
  act(() => d.result.current.drop(d.event));
  expect(execute).toHaveBeenCalledOnce();
});

test("a project load with reused layer IDs rejects a drop before React receives the new page", () => {
  const d = fixture(),
    execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.text));
  const replacement = structuredClone(d.project);
  replacement.id = "project-drag-replacement";
  act(() => d.engine.load(replacement));
  const untouched = d.engine.getSnapshot();
  act(() => d.result.current.drop(d.event, d.text));
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(untouched);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(d.result.current.dragging).toBeNull();
});

test("an active page switch rejects the old native drag before the panel rerenders", () => {
  const d = fixture(),
    other = createPage({ name: "Other page" });
  act(() => {
    d.engine.execute({ type: "addPage", page: other });
    d.engine.setPage(d.page.id);
  });
  const origin = d.engine.getSnapshot().project.pages[0]!;
  d.rerender({ current: origin });
  const execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.start(d.event, origin.layers[0]!));
  act(() => d.result.current.over(d.event, origin.layers[1]!));
  act(() => d.engine.setPage(other.id));
  const untouched = d.engine.getSnapshot();
  expect(() => act(() => d.result.current.drop(d.event, origin.layers[1]!))).not.toThrow();
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(untouched);
});

test("a deferred task rechecks the drag origin immediately before executing its command", () => {
  const d = fixture(),
    execute = vi.spyOn(d.engine, "execute");
  let pending: (() => void) | undefined;
  d.run.mockImplementation((action) => {
    pending = action;
  });
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.text));
  act(() => d.result.current.drop(d.event, d.text));
  expect(pending).toBeTypeOf("function");
  expect(execute).not.toHaveBeenCalled();
  const replacement = structuredClone(d.project);
  replacement.id = "project-deferred-replacement";
  act(() => d.engine.load(replacement));
  const untouched = d.engine.getSnapshot();
  act(() => pending!());
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(untouched);
});

test("returning a layer to its original insertion creates no undo entry or replay commit", () => {
  const d = fixture(),
    execute = vi.spyOn(d.engine, "execute"),
    commits = vi.fn();
  const unsubscribe = d.engine.subscribeCommands(commits);
  const original = d.engine.getSnapshot();
  const event = { ...d.event, clientY: 35 };
  act(() => d.result.current.start(event, d.rectangle));
  act(() => d.result.current.over(event, d.text));
  act(() => d.result.current.drop(event, d.text));
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(original);
  expect(commits).not.toHaveBeenCalled();
  unsubscribe();
});

test("a stale panel cannot start a new drag or keep previewing after an authoritative load", () => {
  const stale = fixture();
  act(() => stale.engine.load(stale.project));
  act(() => stale.result.current.start(stale.event, stale.rectangle));
  expect(stale.transfer.setData).not.toHaveBeenCalled();
  expect(stale.result.current.dragging).toBeNull();
  stale.unmount();
  const active = fixture();
  act(() => active.result.current.start(active.event, active.rectangle));
  act(() => active.result.current.over(active.event, active.text));
  act(() => active.engine.load(active.project));
  act(() => active.result.current.over(active.event, active.text));
  expect(active.result.current.dragging).toBeNull();
  expect(active.result.current.target).toBeNull();
});

test("native autoscroll updates a stationary-pointer target while Motion-only movement keeps insertion intent", () => {
  const d = fixture(),
    original = d.engine.getSnapshot();
  const tree = document.createElement("div");
  tree.setAttribute("role", "tree");
  const firstRow = document.createElement("div"),
    nextRow = document.createElement("div");
  tree.append(firstRow, nextRow);
  vi.spyOn(firstRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 40));
  vi.spyOn(nextRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 40));
  const first = { ...d.event, currentTarget: firstRow };
  const next = { ...d.event, currentTarget: nextRow };
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(first, d.text));
  expect(d.result.current.target?.id).toBe(d.text.id);
  // Rows can move under the pointer during spring layout without a new drag intent.
  act(() => d.result.current.over(next, d.image));
  expect(d.result.current.target?.id).toBe(d.text.id);
  // A real scroll changes which insertion is under the same pointer coordinates.
  tree.scrollTop = 40;
  act(() => d.result.current.over(next, d.image));
  expect(d.result.current.target?.id).toBe(d.image.id);
  expect(d.engine.getSnapshot()).toBe(original);
  act(() => d.result.current.drop(next, d.image));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    d.text.id,
    d.image.id,
    d.rectangle.id,
  ]);
  d.engine.undo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toEqual(d.page.layers);
});
