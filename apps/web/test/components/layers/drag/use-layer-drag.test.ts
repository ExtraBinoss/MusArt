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
    setDragImage: vi.fn(),
    getData: () => d.rectangle.id,
    effectAllowed: "",
    dropEffect: "",
  };
  const row = document.createElement("div");
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 40));
  const event = {
    clientX: 20,
    clientY: 5,
    altKey: false,
    preventDefault: vi.fn(),
    nativeEvent: new Event("dragstart", { cancelable: true }),
    dataTransfer: transfer,
    currentTarget: row,
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
  expect(document.querySelector(".layer-drag-preview")).not.toBeNull();
  act(() => d.result.current.over(d.event, d.text));
  expect(d.result.current.target).toEqual({ id: d.text.id, position: "before" });
  expect(d.result.current.dragging).toBe(d.rectangle.id);
  const projected = d.result.current.layers;
  act(() => d.result.current.over(d.event, d.text));
  expect(d.result.current.layers).toBe(projected);
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => d.result.current.drop(d.event, d.text));
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: "reorderLayer", id: d.rectangle.id }),
  );
  expect(d.result.current.target).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toEqual(d.page.layers);
});

test("native drag feedback is owned through restart, Escape, dragend, blur and unmount", () => {
  const d = fixture();
  const start = () => act(() => d.result.current.start(d.event, d.rectangle));
  start();
  const first = document.querySelector(".layer-drag-preview");
  start();
  expect(first?.isConnected).toBe(false);
  expect(document.querySelectorAll(".layer-drag-preview")).toHaveLength(1);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  start();
  fireEvent.dragEnd(window);
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  start();
  fireEvent.blur(window);
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  start();
  d.unmount();
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
});

test("a subsequently rejected native dragstart clears its own feedback without canceling a replacement drag", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  act(() => d.result.current.start(d.event, d.rectangle));
  d.event.nativeEvent.preventDefault();
  await act(async () => Promise.resolve());
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  expect(d.result.current.dragging).toBeNull();
  expect(d.engine.getSnapshot()).toBe(before);
  const native = () =>
    new Event("dragstart", { cancelable: true }) as DragEvent<HTMLElement>["nativeEvent"];
  const first = { ...d.event, nativeEvent: native() },
    next = { ...d.event, nativeEvent: native() };
  act(() => d.result.current.start(first, d.rectangle));
  const stale = document.querySelector(".layer-drag-preview");
  act(() => d.result.current.start(next, d.rectangle));
  first.nativeEvent.preventDefault();
  await act(async () => Promise.resolve());
  expect(stale?.isConnected).toBe(false);
  expect(document.querySelectorAll(".layer-drag-preview")).toHaveLength(1);
  expect(d.result.current.dragging).toBe(d.rectangle.id);
  d.unmount();
});
test("dropping a colored rectangle onto a target thumbnail creates one editable alpha mask", () => {
  const d = fixture(),
    row = document.createElement("div"),
    thumbnail = document.createElement("span"),
    execute = vi.spyOn(d.engine, "execute");
  thumbnail.dataset.thumbnailLayerId = d.text.id;
  row.append(thumbnail);
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 40));
  vi.spyOn(thumbnail, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 8, 24, 24));
  const event = { ...d.event, clientX: 42, clientY: 20, currentTarget: row };
  act(() => d.result.current.start(event, d.rectangle));
  act(() => d.result.current.over(event, d.text));
  expect(d.result.current.target).toEqual({ id: d.text.id, position: "mask" });
  expect(d.transfer.dropEffect).toBe("move");
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => d.result.current.drop(event, d.text));
  expect(execute).toHaveBeenCalledExactlyOnceWith({
    type: "attachLayerMask",
    sourceId: d.rectangle.id,
    targetId: d.text.id,
  });
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.text.id)?.mask,
  ).toMatchObject({ layerId: d.rectangle.id, mode: "alpha", enabled: true });
  d.engine.undo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toEqual(d.page.layers);
});
test("Escape, invalid targets, dragend and concurrent document changes restore visual order and reject late drops", () => {
  const d = fixture();
  const execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.over(d.event, d.text));
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => d.result.current.over(d.event, d.rectangle));
  expect(d.transfer.dropEffect).toBe("move");
  expect(d.event.preventDefault).toHaveBeenCalled();
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
test("starts on an inactive artboard and rejects cross-artboard targets without losing the native source", () => {
  const d = fixture(),
    other = createPage({ layers: [createLayer("rectangle"), createLayer("text")] });
  act(() => d.engine.execute({ type: "addPage", page: other }));
  const first = d.engine.getSnapshot().project.pages[0]!,
    second = d.engine.getSnapshot().project.pages[1]!;
  act(() => d.engine.setPage(first.id));
  d.rerender({ current: first });
  act(() => d.result.current.start(d.event, second.layers[0]!, second));
  expect(d.engine.getSnapshot().pageId).toBe(second.id);
  expect(d.result.current.dragging).toBe(second.layers[0]!.id);
  act(() => d.result.current.over(d.event, second.layers[1]!, second));
  expect(d.result.current.target?.id).toBe(second.layers[1]!.id);
  act(() => d.result.current.over(d.event, first.layers[0]!, first));
  expect(d.transfer.dropEffect).toBe("none");
  expect(d.result.current.target).toBeNull();
  expect(d.result.current.dragging).toBe(second.layers[0]!.id);
  const before = d.engine.getSnapshot();
  act(() => d.result.current.drop(d.event, first.layers[0]!, first));
  expect(d.engine.getSnapshot()).toBe(before);
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

test("two mounted surfaces share one native drag and either target commits its original command once", () => {
  const d = fixture();
  const other = renderHook(() => useLayerDrag(d.page, d.engine, d.run));
  const execute = vi.spyOn(d.engine, "execute");
  act(() => d.result.current.start(d.event, d.rectangle));
  expect(other.result.current.dragging).toBe(d.rectangle.id);
  act(() => other.result.current.over(d.event, d.text));
  expect(d.result.current.target).toEqual(other.result.current.target);
  expect(d.result.current.layers).toBe(other.result.current.layers);
  act(() => other.result.current.drop(d.event, d.text));
  expect(execute).toHaveBeenCalledOnce();
  expect(d.result.current.dragging).toBeNull();
  expect(other.result.current.dragging).toBeNull();
  other.unmount();
});

test("unmounting an old native surface cannot remove a replacement owner's preview", () => {
  const d = fixture(), other = renderHook(() => useLayerDrag(d.page, d.engine, d.run));
  act(() => d.result.current.start(d.event, d.rectangle));
  act(() => other.result.current.start(d.event, d.text));
  d.unmount();
  expect(other.result.current.dragging).toBe(d.text.id);
  expect(document.querySelectorAll(".layer-drag-preview")).toHaveLength(1);
  other.unmount();
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
});

test("a rejected native image releases the controller and surfaces the real platform error", () => {
  const d = fixture();
  d.transfer.setDragImage.mockImplementation(() => { throw Error("Platform rejected drag image"); });
  expect(() => act(() => d.result.current.start(d.event, d.rectangle))).toThrow("Platform rejected drag image");
  expect(d.result.current.dragging).toBeNull();
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
});
