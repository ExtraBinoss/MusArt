import type { KeyboardEvent, PointerEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createTimelineGestures } from "../../../src/components/motion/gestures";
import { makeTransport } from "./support";

afterEach(() => {
  document.body.innerHTML = "";
});
function fixture(movable = false, duration = 2) {
  const a = createLayer("rectangle", { id: "a" }),
    b = createLayer("rectangle", { id: "b" });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [a, b] })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  if (duration !== 2)
    engine.execute({ type: "setMotionDuration", duration: { value: duration, rate: 1 } });
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
  if (movable)
    engine.execute({
      type: "setMotionTrackRange",
      trackId: track().id,
      start: { value: 0, rate: 1 },
      end: { value: 3, rate: 2 },
    });
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
  const d = fixture(true),
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
  // The later selected key needs real authored room for the half-second move.
  const d = fixture(false, 3),
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
  const menu = document.createElement("div"),
    item = document.createElement("button");
  menu.setAttribute("role", "menu");
  menu.append(item);
  d.root.append(menu);
  d.keyDown("Delete", item);
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
  const d = fixture(true),
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
  const d = fixture(true),
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

it("keeps selection identity and notification count for semantic no-ops, independent of insertion order", () => {
  const d = fixture(),
    first = d.keys[0]!.id,
    second = d.keys[1]!.id;
  const empty = d.controls.readSelected();
  d.controls.selectKeys([], false);
  expect(d.controls.readSelected()).toBe(empty);
  expect(d.onSelection).not.toHaveBeenCalled();
  d.controls.selectKeys([first, second], false);
  const both = d.controls.readSelected();
  expect(d.onSelection).toHaveBeenCalledOnce();
  d.controls.selectKeys([second, first], false);
  d.controls.selectKeys([first, second], true);
  expect(d.controls.readSelected()).toBe(both);
  expect([...d.controls.readSelected()]).toEqual([first, second]);
  expect(d.onSelection).toHaveBeenCalledOnce();
  d.controls.selectKeys([first], false);
  const one = d.controls.readSelected();
  expect(one).not.toBe(both);
  expect(d.onSelection).toHaveBeenCalledTimes(2);
  d.controls.selectKeys([second], false);
  expect(d.controls.readSelected()).not.toBe(one);
  expect([...d.controls.readSelected()]).toEqual([second]);
  expect(d.onSelection).toHaveBeenCalledTimes(3);
  d.controls.selectKeys([], false);
  const cleared = d.controls.readSelected();
  d.controls.selectKeys([], false);
  expect(d.controls.readSelected()).toBe(cleared);
  expect(d.onSelection).toHaveBeenCalledTimes(4);
  d.controls.dispose();
});

it("clamps huge pointer packets at zero and D without extending duration, then undoes once", () => {
  const d = fixture(true),
    before = d.engine.getSnapshot().project;
  const transaction = vi.spyOn(d.engine, "transaction");
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", -12000);
  expect(d.root.dataset.timelineBoundary).toBe("start");
  expect(d.controls.readPreview()!.delta).toEqual({ value: 0, rate: 1 });
  d.send(d.body, "pointermove", 12000);
  expect(d.root.dataset.timelineBoundary).toBe("end");
  expect(d.controls.readPreview()!.delta).toEqual({ value: 1, rate: 2 });
  expect(d.row.style.getPropertyValue("--motion-drag-x")).toBe("50px");
  expect(d.engine.getSnapshot().project).toBe(before);
  d.send(d.body, "pointerup", 12000);
  expect(transaction).toHaveBeenCalledOnce();
  expect(d.track().start).toEqual({ value: 1, rate: 2 });
  expect(d.track().end).toEqual({ value: 2, rate: 1 });
  expect(d.page().motion!.duration).toEqual({ value: 2, rate: 1 });
  expect(d.root).not.toHaveAttribute("data-timeline-boundary");
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before);
  d.controls.dispose();
});

function groupFixture() {
  const d = fixture(true),
    project = structuredClone(d.engine.getSnapshot().project),
    page = project.pages[0]!;
  page.layers[0] = createLayer("group", { ...page.layers[0]!, id: "a", kind: "group" });
  page.layers[1]!.parentId = "a";
  const motion = page.motion!,
    parent = motion.tracks.find((t) => t.layerId === "a")!,
    child = motion.tracks.find((t) => t.layerId === "b")!;
  motion.version = 2;
  motion.duration = { value: 5, rate: 1 };
  parent.start = { value: 1, rate: 1 };
  parent.end = { value: 2, rate: 1 };
  child.start = { value: 1, rate: 2 };
  child.end = { value: 3, rate: 2 };
  motion.tracks.push(
    {
      id: "other-parent",
      layerId: "a",
      start: { value: 4, rate: 1 },
      end: { value: 5, rate: 1 },
      properties: [],
    },
    {
      id: "child-late",
      layerId: "b",
      start: { value: 3, rate: 1 },
      end: { value: 4, rate: 1 },
      properties: [
        {
          id: "late-x",
          target: { kind: "layer", layerId: "b", property: "x" },
          keyframes: [{ id: "late-key", time: { value: 3, rate: 1 }, value: 4 }],
        },
      ],
    },
  );
  d.engine.load(project);
  const snapshot = d.engine.getSnapshot();
  d.controls.updateOrigin(snapshot.project.id, snapshot.revision);
  const wraps = [child.id, "child-late", "other-parent"].map((id) => {
    const node = document.createElement("div");
    node.className = "motion-track-wrap";
    node.dataset.trackId = id;
    d.root.append(node);
    return node;
  });
  const key = document.createElement("button");
  key.className = "motion-key";
  key.dataset.keyId = "late-key";
  d.root.append(key);
  return { ...d, wraps, childId: child.id, lateKey: key };
}

it("previews every grouped child occurrence with common bounds and clears red-boundary ownership on cancel", () => {
  const d = groupFixture(),
    before = d.engine.getSnapshot().project;
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", -12000);
  expect(d.root.dataset.timelineBoundary).toBe("start");
  expect(d.controls.readPreview()!.delta).toEqual({ value: -1, rate: 2 });
  d.send(d.body, "pointermove", 12000);
  expect(d.root.dataset.timelineBoundary).toBe("end");
  expect(d.controls.readPreview()!.trackIds).toEqual(
    new Set([d.track().id, d.childId, "child-late"]),
  );
  for (const node of [d.wrap, d.wraps[0]!, d.wraps[1]!, d.lateKey])
    expect(node.style.getPropertyValue("--motion-drag-x")).toBe("100px");
  expect(d.wraps[2]!.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.send(d.body, "pointermove", 150);
  expect(d.root).not.toHaveAttribute("data-timeline-boundary");
  d.controls.cancel();
  expect(d.controls.readPreview()).toBeNull();
  expect(d.root).not.toHaveAttribute("data-timeline-boundary");
  for (const node of [d.wrap, ...d.wraps, d.lateKey])
    expect(node.style.getPropertyValue("--motion-drag-x")).toBe("");
  d.send(d.body, "pointerup", 12000);
  expect(d.engine.getSnapshot().project).toBe(before);
  d.controls.dispose();
});

it("commits all grouped child ranges and keys at the shared end bound with one undo", () => {
  const d = groupFixture(),
    before = d.engine.getSnapshot().project;
  const transaction = vi.spyOn(d.engine, "transaction");
  const other = d.page().motion!.tracks.find((t) => t.id === "other-parent")!;
  d.controls.beginTrack(d.event(), d.track(), "move");
  d.send(d.body, "pointermove", 12000);
  d.send(d.body, "pointerup", 12000);
  expect(transaction).toHaveBeenCalledOnce();
  expect(d.track().start).toEqual({ value: 2, rate: 1 });
  expect(d.page().motion!.tracks.find((t) => t.id === d.childId)!.start).toEqual({
    value: 3,
    rate: 2,
  });
  const late = d.page().motion!.tracks.find((t) => t.id === "child-late")!;
  expect(late.start).toEqual({ value: 4, rate: 1 });
  expect(late.end).toEqual({ value: 5, rate: 1 });
  expect(late.properties[0]!.keyframes[0]!.time).toEqual({ value: 4, rate: 1 });
  expect(d.page().motion!.tracks.find((t) => t.id === "other-parent")).toEqual(other);
  expect(d.page().motion!.duration).toEqual({ value: 5, rate: 1 });
  expect(d.controls.readPreview()).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before);
  d.controls.dispose();
});
