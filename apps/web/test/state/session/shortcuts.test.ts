import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { useShortcuts } from "../../../src/state/session/shortcuts";
import { toolAtom, previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
import { keybindings } from "../../../src/state/keybindings/store";
import type {
  PixelSelectionPort,
  PixelSelectionState,
} from "../../../src/services/selection/wand/model";
import { attachmentSelection } from "../../../src/state/selection/attachments";
afterEach(() => {
  act(() => keybindings.reset());
  localStorage.clear();
});
test("routes pixel-region Delete and CtrlD before layer commands and respects attachment intent", async () => {
  const d = setup();
  let region: PixelSelectionState | null = {
    layerId: d.image.id,
    width: 100,
    height: 100,
    path: "M0 0H10",
    selected: 10,
    simplified: false,
    tolerance: 0,
    mode: "new",
    contiguous: true,
    busy: false,
    dragging: false,
  };
  const port: PixelSelectionPort = {
    read: () => region,
    subscribe: () => () => {},
    begin: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    accept: vi.fn(async () => {}),
    cancel: vi.fn(),
    invert: vi.fn(async () => {}),
    createMask: vi.fn(async () => {}),
    erase: vi.fn(async () => {}),
    deselect: vi.fn(() => {
      region = null;
    }),
    dispose: vi.fn(),
  };
  d.services.pixelSelection = port;
  d.engine.select([d.image.id]);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  const before = d.engine.getSnapshot().project;
  await act(() => fireEvent.keyDown(document, { key: "Delete" }));
  expect(port.erase).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project).toBe(before);
  await act(() => fireEvent.keyDown(document, { key: "d", ctrlKey: true }));
  expect(port.deselect).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project).toBe(before);
  await act(() => fireEvent.keyDown(document, { key: "d", ctrlKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(4);
  d.engine.undo();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.image.id],
    patch: {
      mask: { assetId: "asset1", mode: "alpha", enabled: true, inverted: false },
    },
  });
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(
    attachmentSelection(d.engine).select(page, {
      kind: "mask",
      pageId: page.id,
      layerId: d.image.id,
    }),
  ).toBe(true);
  region = {
    layerId: d.image.id,
    width: 100,
    height: 100,
    path: "M0 0H10",
    selected: 10,
    simplified: false,
    tolerance: 0,
    mode: "new",
    contiguous: true,
    busy: false,
    dragging: false,
  };
  await act(() => fireEvent.keyDown(document, { key: "Delete" }));
  expect(port.erase).toHaveBeenCalledOnce();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.image.id)?.mask,
  ).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  attachmentSelection(d.engine).clear();
  hook.unmount();
});
test("uses persisted tool/save overrides and refuses captured or editable key events", () => {
  const d = setup();
  keybindings.assign("action:toolText", [{ key: "j", mod: false, alt: false, shift: false }]);
  keybindings.assign("action:save", [{ key: "p", mod: true, alt: true, shift: false }]);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  fireEvent.keyDown(document, { key: "t" });
  expect(d.store.get(toolAtom)).toBe("pointer");
  fireEvent.keyDown(document, { key: "j" });
  expect(d.store.get(toolAtom)).toBe("text");
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  expect(d.services.saveProject).not.toHaveBeenCalled();
  const capture = document.createElement("button");
  capture.setAttribute("data-keybinding-capture", "");
  document.body.append(capture);
  fireEvent.keyDown(capture, { key: "p", ctrlKey: true, altKey: true });
  expect(d.services.saveProject).not.toHaveBeenCalled();
  capture.remove();
  fireEvent.keyDown(document, { key: "p", ctrlKey: true, altKey: true });
  expect(d.services.saveProject).toHaveBeenCalledOnce();
  hook.unmount();
});

test("opted-in document scopes honor customized history bindings and isolate nested captures", async () => {
  const d = setup();
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 99 } });
  keybindings.assign("action:undo", [{ key: "u", mod: true, alt: true, shift: false }]);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  const scope = document.createElement("section"),
    control = document.createElement("button"),
    nested = document.createElement("div");
  scope.setAttribute("data-keybinding-capture", "");
  scope.setAttribute("data-document-shortcuts", "");
  nested.setAttribute("data-keybinding-capture", "");
  scope.append(control, nested);
  document.body.append(scope);
  try {
    fireEvent.keyDown(control, { key: "z", ctrlKey: true });
    fireEvent.keyDown(control, { key: "r" });
    fireEvent.keyDown(control, { key: "Delete" });
    expect(d.store.get(toolAtom)).toBe("pointer");
    expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(99);
    await act(() => fireEvent.keyDown(nested, { key: "u", ctrlKey: true, altKey: true }));
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(99);
    await act(() => fireEvent.keyDown(control, { key: "u", ctrlKey: true, altKey: true }));
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
  } finally {
    scope.remove();
    hook.unmount();
  }
});
test("does not execute a queued shortcut against a previous engine or a replaced document", () => {
  const d = setup(),
    other = setup();
  d.engine.select([d.rectangle.id]);
  let queued!: () => void | Promise<void>;
  d.onTask.mockImplementationOnce(async (action) => {
    queued = action;
    return true;
  });
  const hook = renderHook(({ engine }) => useShortcuts(engine, d.services, d.onTask), {
    initialProps: { engine: d.engine },
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  fireEvent.keyDown(document, { key: "Delete" });
  hook.rerender({ engine: other.engine });
  expect(() => queued()).toThrow("Le document a changé");
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  hook.unmount();
});
test("blocks all editor shortcuts until a real project has been chosen", () => {
  const d = setup();
  const hook = renderHook(({ enabled }) => useShortcuts(d.engine, d.services, d.onTask, enabled), {
    initialProps: { enabled: false },
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  d.engine.select([d.rectangle.id]);
  const initial = d.engine.getSnapshot();
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  fireEvent.keyDown(document, { key: "Delete" });
  fireEvent.keyDown(document, { key: "ArrowRight" });
  fireEvent.keyDown(document, { key: "t" });
  expect(d.services.saveProject).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(initial);
  expect(d.store.get(toolAtom)).toBe("pointer");
  hook.rerender({ enabled: true });
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  expect(d.services.saveProject).toHaveBeenCalledOnce();
  hook.unmount();
});
test("maps tool shortcuts and routes keyboard document commands through the same engine", async () => {
  const d = setup();
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  for (const [key, tool] of [
    ["v", "pointer"],
    ["h", "hand"],
    ["u", "shape"],
    ["r", "rectangle"],
    ["o", "ellipse"],
    ["t", "text"],
    ["w", "wand"],
    ["s", "segment"],
  ]) {
    await act(() => fireEvent.keyDown(document, { key }));
    expect(d.store.get(toolAtom)).toBe(tool);
  }
  d.engine.select([d.rectangle.id]);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"])
    await act(() => fireEvent.keyDown(document, { key }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!).toMatchObject({ x: 20, y: 30 });
  await act(() => fireEvent.keyDown(document, { key: "ArrowRight", shiftKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(30);
  await act(() => fireEvent.keyDown(document, { key: "z", ctrlKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
  await act(() => fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(30);
  await act(() => fireEvent.keyDown(document, { key: "z", metaKey: true }));
  await act(() => fireEvent.keyDown(document, { key: "y", ctrlKey: true }));
  await act(() => fireEvent.keyDown(document, { key: "d", ctrlKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(4);
  await act(() => fireEvent.keyDown(document, { key: "Delete" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  d.engine.select([d.rectangle.id, d.text.id]);
  await act(() => fireEvent.keyDown(document, { key: "g", ctrlKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.some((l) => l.kind === "group")).toBe(
    true,
  );
  await act(() => fireEvent.keyDown(document, { key: "g", ctrlKey: true, shiftKey: true }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.some((l) => l.kind === "group")).toBe(
    false,
  );
  await act(() => fireEvent.keyDown(document, { key: "a", ctrlKey: true }));
  expect(d.engine.getSnapshot().selection).toHaveLength(3);
  d.store.set(previewAtom, {
    target: "layer",
    layerId: d.rectangle.id,
    patch: { fill: "#ffffff" },
  });
  await act(() => fireEvent.keyDown(document, { key: "Escape" }));
  expect(d.engine.getSnapshot().selection).toEqual([]);
  expect(d.store.get(previewAtom)).toBeNull();
  await act(() => fireEvent.keyDown(document, { key: "s", ctrlKey: true }));
  expect(d.services.saveProject).toHaveBeenCalledOnce();
  hook.unmount();
});
test("preserves text editing and modal shortcuts while still supporting save", () => {
  const d = setup();
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "r" });
  expect(d.store.get(toolAtom)).toBe("pointer");
  fireEvent.keyDown(input, { key: "s", ctrlKey: true });
  expect(d.services.saveProject).toHaveBeenCalled();
  input.remove();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  const button = document.createElement("button");
  dialog.append(button);
  document.body.append(dialog);
  fireEvent.keyDown(button, { key: "r" });
  expect(d.store.get(toolAtom)).toBe("pointer");
  dialog.remove();
  fireEvent.keyDown(document, { key: "q", ctrlKey: true });
  fireEvent.keyDown(document, { key: "Backspace" });
  hook.unmount();
});

test("nudges selected group roots once and respects locked ancestors and rotated parent axes", async () => {
  const d = setup();
  const { createLayer, getWorldBounds } = await import("@musart/core");
  const group = createLayer("group", {
    id: "moving-group",
    x: 100,
    y: 100,
    width: 300,
    height: 300,
  });
  const child = createLayer("rectangle", {
    id: "moving-child",
    parentId: group.id,
    x: 20,
    y: 30,
    width: 50,
    height: 50,
  });
  const locked = createLayer("group", {
    id: "locked-group",
    x: 200,
    y: 200,
    width: 200,
    height: 200,
    locked: false,
  });
  const protectedChild = createLayer("rectangle", {
    id: "protected-child",
    parentId: locked.id,
    x: 10,
    y: 10,
    width: 30,
    height: 30,
  });
  d.engine.execute({ type: "addLayers", layers: [group, child, locked, protectedChild] });
  d.engine.execute({ type: "updateLayers", ids: [locked.id], patch: { locked: true } });
  d.engine.load(d.engine.getSnapshot().project);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  const before = d.engine.getSnapshot().project.pages[0]!;
  await act(() => fireEvent.keyDown(document, { key: "a", ctrlKey: true }));
  await act(() => fireEvent.keyDown(document, { key: "ArrowRight" }));
  const after = d.engine.getSnapshot().project.pages[0]!;
  expect(getWorldBounds(after, child.id).x - getWorldBounds(before, child.id).x).toBe(1);
  expect(after.layers.find((layer) => layer.id === child.id)!.x).toBe(child.x);
  expect(getWorldBounds(after, protectedChild.id)).toEqual(
    getWorldBounds(before, protectedChild.id),
  );
  d.engine.undo();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.engine.execute({ type: "updateLayers", ids: [group.id], patch: { rotation: 90 } });
  d.engine.select([child.id]);
  const rotatedBefore = d.engine.getSnapshot().project.pages[0]!;
  await act(() => fireEvent.keyDown(document, { key: "ArrowRight" }));
  const rotatedAfter = d.engine.getSnapshot().project.pages[0]!;
  expect(
    getWorldBounds(rotatedAfter, child.id).x - getWorldBounds(rotatedBefore, child.id).x,
  ).toBeCloseTo(1);
  expect(
    getWorldBounds(rotatedAfter, child.id).y - getWorldBounds(rotatedBefore, child.id).y,
  ).toBeCloseTo(0);
  hook.unmount();
});

test("leaves focused widget keys and consumed events to their own controls", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  for (const role of ["slider", "spinbutton", "combobox", "listbox", "menu"]) {
    const control = document.createElement("div");
    control.setAttribute("role", role);
    document.body.append(control);
    fireEvent.keyDown(control, { key: "ArrowRight" });
    fireEvent.keyDown(control, { key: "r" });
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
    expect(d.store.get(toolAtom)).toBe("pointer");
    control.remove();
  }
  const consumed = new KeyboardEvent("keydown", { key: "r", cancelable: true, bubbles: true });
  consumed.preventDefault();
  document.dispatchEvent(consumed);
  expect(d.store.get(toolAtom)).toBe("pointer");
  hook.unmount();
});

test("Ctrl/Cmd Space plays Motion from canvas and timeline controls, respecting input, repeat and custom bindings", async () => {
  const d = setup();
  const { createMotionTransport } = await import("../../../src/services/motion/transport");
  const transport = createMotionTransport(d.engine);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  await act(() => fireEvent.keyDown(document, { key: " ", ctrlKey: true }));
  expect(transport.read().playing).toBe(false);
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const before = d.engine.getSnapshot();
  await act(() => fireEvent.keyDown(document, { key: " ", ctrlKey: true }));
  expect(transport.read().playing).toBe(true);
  await act(() => fireEvent.keyDown(document, { key: " ", ctrlKey: true, repeat: true }));
  expect(transport.read().playing).toBe(true);
  const panel = document.createElement("section"),
    button = document.createElement("button"),
    input = document.createElement("input");
  panel.setAttribute("data-keybinding-capture", "");
  panel.setAttribute("data-document-shortcuts", "");
  panel.append(button, input);
  document.body.append(panel);
  await act(() => fireEvent.keyDown(input, { key: " ", metaKey: true }));
  expect(transport.read().playing).toBe(true);
  await act(() => fireEvent.keyDown(button, { key: " ", metaKey: true }));
  expect(transport.read().playing).toBe(false);
  act(() =>
    keybindings.assign("action:togglePlayback", [
      { key: "p", mod: true, alt: false, shift: false },
    ]),
  );
  await act(() => fireEvent.keyDown(document, { key: " ", ctrlKey: true }));
  expect(transport.read().playing).toBe(false);
  await act(() => fireEvent.keyDown(document, { key: "p", ctrlKey: true }));
  expect(transport.read().playing).toBe(true);
  expect(d.engine.getSnapshot()).toBe(before);
  hook.unmount();
  panel.remove();
  transport.dispose();
});
