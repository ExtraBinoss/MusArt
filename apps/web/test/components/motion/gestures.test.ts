import type { KeyboardEvent, PointerEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createTimelineGestures } from "../../../src/components/motion/gestures";
import { makeTransport } from "./support";

afterEach(() => {
  document.body.innerHTML = "";
});
function fixture() {
  const a = createLayer("rectangle", { id: "a" }),
    b = createLayer("rectangle", { id: "b" });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [a, b] })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [layerId, value] of [
    ["a", 0],
    ["a", 1],
    ["b", 2],
  ] as const)
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId, property: "x" },
      time: { value, rate: 1 },
      value,
    });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const track = () => page().motion!.tracks.find((item) => item.layerId === "a")!;
  const root = document.createElement("section"),
    viewport = document.createElement("div"),
    row = document.createElement("div"),
    wrap = document.createElement("div"),
    body = document.createElement("button"),
    feedback = document.createElement("output");
  row.className = "motion-row";
  row.dataset.layerId = "a";
  wrap.className = "motion-track-wrap";
  wrap.dataset.trackId = track().id;
  root.append(viewport, row, feedback);
  row.append(wrap);
  wrap.append(body);
  document.body.append(root);
  const keys = track().properties[0]!.keyframes;
  const keyButtons = keys.map((key) => {
    const node = document.createElement("button");
    node.className = "motion-key";
    node.dataset.keyId = key.id;
    row.append(node);
    return node;
  });
  const runtime = makeTransport(page()),
    onSelection = vi.fn(),
    onError = vi.fn();
  const draft = { update: vi.fn(() => true), clear: vi.fn() };
  runtime.transport.beginKeyframePreview = vi.fn(() => draft);
  const controls = createTimelineGestures({
    engine,
    transport: runtime.transport,
    compositionId: page().id,
    onSelection,
    onError,
  });
  controls.connect({ root, viewport, scale: 100, feedback });
  const event = (node = body, x = 100, shiftKey = false) =>
    ({
      currentTarget: node,
      button: 0,
      pointerId: 7,
      clientX: x,
      shiftKey,
      preventDefault() {},
      stopPropagation() {},
    }) as unknown as PointerEvent<HTMLElement>;
  const send = (node: HTMLElement, type: string, x: number, shiftKey = false) => {
    const value = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, shiftKey });
    Object.defineProperty(value, "pointerId", { value: 7 });
    node.dispatchEvent(value);
  };
  const keyDown = (key: string, target: HTMLElement = body) =>
    controls.keyDown({
      key,
      target,
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent<HTMLElement>);
  return {
    engine,
    page,
    track,
    root,
    row,
    wrap,
    body,
    feedback,
    keys,
    keyButtons,
    runtime,
    draft,
    controls,
    event,
    send,
    keyDown,
    onSelection,
    onError,
  };
}

it("publishes track drags only to DOM and commits one complete undoable transaction", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  const transactions = vi.spyOn(d.engine, "transaction");
  d.controls.beginTrack(d.event(), d.track(), "move");
  expect(d.body).not.toHaveAttribute("data-dragging");
  d.send(d.body, "pointermove", 102);
  expect(d.body).not.toHaveAttribute("data-dragging");
  const changes = d.onSelection.mock.calls.length;
  for (const x of [110, 120, 130, 150]) d.send(d.body, "pointermove", x);
  expect(d.body).toHaveAttribute("data-dragging", "true");
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("50px");
  expect(d.onSelection.mock.calls.length).toBe(changes);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(transactions).not.toHaveBeenCalled();
  d.send(d.body, "pointerup", 150);
  expect(d.body).not.toHaveAttribute("data-dragging");
  expect(transactions).toHaveBeenCalledOnce();
  expect(d.track().start).toEqual({ value: 1, rate: 2 });
  expect(d.track().properties[0]!.keyframes.map((key) => key.time)).toEqual([
    { value: 1, rate: 2 },
    { value: 3, rate: 2 },
  ]);
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before);
  d.controls.dispose();
});

it("distinguishes trim from placement without moving or deleting property keys", () => {
  const d = fixture(),
    times = d.keys.map((key) => key.time);
  d.controls.beginTrack(d.event(), d.track(), "trimStart");
  d.send(d.body, "pointermove", 125);
  expect(d.wrap.style.getPropertyValue("--motion-trim-left")).toBe("25px");
  expect(d.wrap.style.getPropertyValue("--motion-trim-width")).toBe("175px");
  d.send(d.body, "pointerup", 125);
  expect(d.track().start).toEqual({ value: 1, rate: 4 });
  expect(d.track().end).toBeNull();
  expect(d.track().properties[0]!.keyframes.map((key) => key.time)).toEqual(times);
  const snapshot = d.engine.getSnapshot();
  d.controls.updateOrigin(snapshot.project.id, snapshot.revision);
  d.controls.beginTrack(d.event(), d.track(), "trimEnd");
  d.send(d.body, "pointermove", 50);
  d.send(d.body, "pointerup", 50);
  expect(d.track().end).toEqual({ value: 3, rate: 2 });
  expect(d.track().properties[0]!.keyframes.map((key) => key.time)).toEqual(times);
  d.controls.dispose();
});

it("restores temporary DOM and selection on Escape, pointer cancel and disposal", () => {
  for (const exit of ["escape", "cancel", "dispose"] as const) {
    const d = fixture(),
      before = d.engine.getSnapshot().project;
    d.controls.beginTrack(d.event(), d.track(), "move");
    d.send(d.body, "pointermove", 130);
    if (exit === "escape") d.keyDown("Escape");
    else if (exit === "cancel") d.send(d.body, "pointercancel", 130);
    else d.controls.dispose();
    expect(d.engine.getSnapshot().project).toBe(before);
    expect(d.engine.getSnapshot().selection).toEqual([]);
    expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("");
    d.send(d.body, "pointerup", 130);
    expect(d.engine.getSnapshot().project).toBe(before);
    d.controls.dispose();
  }
});

it("rejects stale origins and retires all pending work after an authored revision changes", () => {
  const d = fixture();
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", 150);
  d.engine.execute({ type: "renameProject", name: "changed during drag" });
  const afterEdit = d.engine.getSnapshot();
  d.send(d.body, "pointerup", 150);
  expect(d.engine.getSnapshot()).toBe(afterEdit);
  expect(d.onError).toHaveBeenLastCalledWith("changed");
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", 150);
  d.send(d.body, "pointerup", 150);
  expect(d.engine.getSnapshot()).toBe(afterEdit);
  d.controls.dispose();
});

it("moves a Shift-selected key set atomically, snaps to exact playhead time and deletes in one batch", () => {
  const d = fixture(),
    first = d.keys[0]!,
    secondLayerKey = d.page().motion!.tracks.find((track) => track.layerId === "b")!.properties[0]!
      .keyframes[0]!;
  d.controls.selectKey(first.id, false);
  const tooltip = document.createElement("span");
  tooltip.dataset.motionKeyTooltip = first.id;
  tooltip.dataset.timeUnit = "ms";
  tooltip.textContent = "0 ms";
  const accessibleTooltip = tooltip.cloneNode(true) as HTMLElement;
  document.body.append(tooltip, accessibleTooltip);
  d.controls.selectKey(secondLayerKey.id, true);
  d.runtime.update({ time: { value: 1, rate: 2 } });
  d.controls.beginKey(d.event(d.keyButtons[0]), "a", first);
  d.send(d.keyButtons[0]!, "pointermove", 146, true);
  expect(d.draft.update).toHaveBeenLastCalledWith({ value: 1, rate: 2 }, { value: 1, rate: 2 });
  expect(tooltip).toHaveTextContent("500 ms");
  expect(accessibleTooltip).toHaveTextContent("500 ms");
  expect(d.keyButtons[0]!.style.getPropertyValue("--motion-drag-x")).toBe("50px");
  d.send(d.keyButtons[0]!, "pointerup", 146, true);
  expect(d.draft.clear).toHaveBeenCalledOnce();
  expect(tooltip).toHaveTextContent("0 ms");
  expect(accessibleTooltip).toHaveTextContent("0 ms");
  expect(d.track().properties[0]!.keyframes[0]!.time).toEqual({ value: 1, rate: 2 });
  expect(
    d.page().motion!.tracks.find((track) => track.layerId === "b")!.properties[0]!.keyframes[0]!
      .time,
  ).toEqual({ value: 5, rate: 2 });
  const snapshot = d.engine.getSnapshot();
  d.controls.updateOrigin(snapshot.project.id, snapshot.revision);
  const transactions = vi.spyOn(d.engine, "transaction");
  d.keyDown("Delete");
  expect(transactions).toHaveBeenCalledOnce();
  expect(d.track().properties[0]!.keyframes).toHaveLength(1);
  expect(
    d.page().motion!.tracks.find((track) => track.layerId === "b")!.properties[0]!.keyframes,
  ).toHaveLength(0);
  expect(d.controls.readSelected().size).toBe(0);
  d.controls.dispose();
});

it("keeps collisions atomic and leaves text-field Delete to native editing", () => {
  const d = fixture(),
    first = d.keys[0]!;
  d.controls.beginKey(d.event(d.keyButtons[0]), "a", first);
  const before = d.engine.getSnapshot().project;
  d.send(d.keyButtons[0]!, "pointermove", 200);
  d.send(d.keyButtons[0]!, "pointerup", 200);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.onError).toHaveBeenLastCalledWith("gestureFailed");
  const input = document.createElement("input");
  d.root.append(input);
  d.keyDown("Delete", input);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.controls.consumePointerClick(1)).toBe(true);
  expect(d.controls.consumePointerClick(1)).toBe(false);
  d.controls.dispose();
});

it("keeps markers at the last accepted position when the timing preflight rejects a collision", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  d.controls.beginKey(d.event(d.keyButtons[0]), "a", d.keys[0]!);
  d.send(d.keyButtons[0]!, "pointermove", 125);
  expect(d.keyButtons[0]!.style.getPropertyValue("--motion-drag-x")).toBe("25px");
  d.draft.update.mockReturnValueOnce(false);
  d.send(d.keyButtons[0]!, "pointermove", 200);
  expect(d.keyButtons[0]!.style.getPropertyValue("--motion-drag-x")).toBe("25px");
  d.send(d.keyButtons[0]!, "pointerup", 200);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.onError).toHaveBeenLastCalledWith("gestureFailed");
  d.controls.dispose();
});

it("retires gesture DOM immediately when the transport replaces its draft owner", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  d.controls.beginKey(d.event(d.keyButtons[0]), "a", d.keys[0]!);
  d.send(d.keyButtons[0]!, "pointermove", 125);
  expect(d.keyButtons[0]!.style.getPropertyValue("--motion-drag-x")).toBe("25px");
  const [, options] = vi.mocked(d.runtime.transport.beginKeyframePreview!).mock.calls[0]!;
  options!.onRetire!();
  expect(d.keyButtons[0]!.style.getPropertyValue("--motion-drag-x")).toBe("");
  expect(d.draft.clear).toHaveBeenCalledOnce();
  d.send(d.keyButtons[0]!, "pointerup", 125);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.onError).not.toHaveBeenCalled();
  d.controls.dispose();
});

it("hands off a delayed horizontal intent using original coordinates and commits once", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  const input = {
    node: d.body,
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 80,
    shiftKey: false,
  };
  expect(d.controls.beginTrackInput(input, d.track(), "move")).toBe(true);
  d.controls.updatePointer({ pointerId: 7, clientX: 150, clientY: 82, shiftKey: false });
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("50px");
  expect(d.engine.getSnapshot().project).toBe(before);
  const commit = vi.spyOn(d.engine, "transaction");
  d.send(d.body, "pointerup", 150);
  expect(commit).toHaveBeenCalledOnce();
  expect(d.track().start).toEqual({ value: 1, rate: 2 });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before);
  d.controls.dispose();
});

it("restores the pre-axis selection on typed cancellation and ignores foreign pointer packets", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  d.engine.select(["a"]);
  d.controls.beginTrackInput(
    {
      node: d.body,
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 80,
      shiftKey: false,
      originalLayers: ["b"],
    },
    d.track(),
    "move",
  );
  d.controls.updatePointer({ pointerId: 99, clientX: 150, clientY: 80, shiftKey: false });
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.controls.updatePointer({ pointerId: 7, clientX: 150, clientY: 80, shiftKey: false });
  d.controls.cancel();
  expect(d.engine.getSnapshot().selection).toEqual(["b"]);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.controls.dispose();
});

it("samples release-only position and modifier changes before its single commit", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", 120);
  d.send(d.body, "pointerup", 140);
  expect(d.track().start).toEqual({ value: 2, rate: 5 });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before);
  const state = d.engine.getSnapshot();
  d.controls.updateOrigin(state.project.id, state.revision);
  d.runtime.update({ time: { value: 1, rate: 2 } });
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", 144);
  d.send(d.body, "pointerup", 149, true);
  expect(d.track().start).toEqual({ value: 1, rate: 2 });
  d.controls.dispose();
});

it("retires a horizontal gesture without overwriting a later authoritative selection", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", 140);
  d.engine.select(["b"]);
  const installed = d.engine.getSnapshot().selection;
  d.controls.cancel();
  d.send(d.body, "pointerup", 160);
  expect(d.engine.getSnapshot().selection).toBe(installed);
  expect(installed).toEqual(["b"]);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.controls.dispose();
});
