import { afterEach, expect, it, vi } from "vitest";
import {
  promoteTimelinePointer,
  timelineHitIdentity,
  timelineLayerDragEvent,
} from "../../../../src/components/motion/canvas/overlay-events";
import type { TimelineCanvasHit } from "../../../../src/components/motion/canvas/model";

afterEach(() => {
  document.body.replaceChildren();
});

const base = { rowKey: "hero", rowIndex: 0, bounds: { x: 0, y: 0, width: 100, height: 24 } };

it("retains one clip or audio owner across body/trim edges and distinguishes semantic targets", () => {
  const clip: TimelineCanvasHit = { ...base, kind: "clip", layerId: "hero", trackId: "first" };
  const audio: TimelineCanvasHit = { ...base, kind: "audio", trackId: "sound" };
  expect(timelineHitIdentity(null)).toBe("");
  for (const kind of ["clip", "trimStart", "trimEnd"] as const)
    expect(timelineHitIdentity({ ...clip, kind })).toBe(timelineHitIdentity(clip));
  for (const kind of ["audio", "audioTrimStart", "audioTrimEnd"] as const)
    expect(timelineHitIdentity({ ...audio, kind })).toBe(timelineHitIdentity(audio));
  expect(timelineHitIdentity({ ...clip, trackId: "second" })).not.toBe(timelineHitIdentity(clip));
  expect(timelineHitIdentity({ ...clip, rowKey: "other" })).not.toBe(timelineHitIdentity(clip));
  expect(timelineHitIdentity(audio)).not.toBe(timelineHitIdentity(clip));
  const key: TimelineCanvasHit = {
    ...base,
    kind: "key",
    layerId: "hero",
    trackId: "first",
    propertyId: "position",
    keyId: "b",
    firstKeyIndex: 1,
    afterKeyIndex: 2,
  };
  const easing: TimelineCanvasHit = {
    ...base,
    kind: "easing",
    layerId: "hero",
    trackId: "first",
    propertyId: "position",
    keyId: "b",
    previousKeyId: "a",
  };
  expect(timelineHitIdentity(key)).not.toBe(timelineHitIdentity(easing));
  expect(timelineHitIdentity({ ...key, afterKeyIndex: 20 })).not.toBe(timelineHitIdentity(key));
  expect(timelineHitIdentity({ ...key, keyId: "c" })).not.toBe(timelineHitIdentity(key));
  expect(timelineHitIdentity({ ...base, kind: "gap", layerId: "hero", start: 1, end: 2 })).toBe(
    timelineHitIdentity({ ...base, kind: "gap", layerId: "hero", start: 2, end: 3 }),
  );
});

it("forwards the original native DnD payload, coordinates and branded methods through the pointed row", () => {
  const root = document.createElement("div"),
    source = document.createElement("div"),
    row = document.createElement("div"),
    bubbled = vi.fn();
  root.append(source, row);
  document.body.append(root);
  // JSDOM has no DataTransfer constructor. Keep the exact payload attached to the native event.
  const transfer = { dropEffect: "none", setData: vi.fn(), getData: vi.fn(() => "hero") };
  const native = new MouseEvent("dragover", {
    bubbles: true,
    cancelable: true,
    clientX: 307,
    clientY: 181,
    altKey: true,
    ctrlKey: true,
    buttons: 1,
  });
  Object.defineProperty(native, "dataTransfer", { value: transfer });
  root.addEventListener("dragover", bubbled);
  let called = false;
  source.addEventListener("dragover", (event) => {
    called = true;
    const adapted = timelineLayerDragEvent(event as DragEvent, row);
    expect(adapted.currentTarget).toBe(row);
    expect(adapted.target).toBe(source);
    expect(adapted.nativeEvent).toBe(native);
    expect(adapted.dataTransfer).toBe(transfer);
    expect(adapted.type).toBe("dragover");
    expect([
      adapted.clientX,
      adapted.clientY,
      adapted.altKey,
      adapted.ctrlKey,
      adapted.buttons,
    ]).toEqual([307, 181, true, true, 1]);
    const composedPath = Reflect.get(adapted, "composedPath") as Event["composedPath"];
    expect(typeof composedPath).toBe("function");
    expect(composedPath()).toContain(source);
    adapted.dataTransfer.dropEffect = "move";
    adapted.dataTransfer.setData("application/x-musart-layer", "hero");
    const prevent = adapted.preventDefault,
      stop = adapted.stopPropagation;
    prevent();
    stop();
    expect(adapted.defaultPrevented).toBe(true);
  });
  expect(source.dispatchEvent(native)).toBe(false);
  expect(called).toBe(true);
  expect(native.defaultPrevented).toBe(true);
  expect(transfer.dropEffect).toBe("move");
  expect(transfer.setData).toHaveBeenCalledWith("application/x-musart-layer", "hero");
  expect(bubbled).not.toHaveBeenCalled();
});

it("promotes a cold pointer once with its identity, buttons, coordinates and all modifiers", () => {
  const root = document.createElement("div"),
    target = document.createElement("button");
  root.append(target);
  document.body.append(root);
  const received: PointerEvent[] = [],
    bubbled = vi.fn();
  target.addEventListener("pointerdown", (event) => {
    received.push(event);
    event.preventDefault();
  });
  root.addEventListener("pointerdown", bubbled);
  const original = new PointerEvent("pointerdown", {
    pointerId: 42,
    pointerType: "pen",
    button: 2,
    buttons: 2,
    clientX: 317.25,
    clientY: 183.5,
    shiftKey: true,
    altKey: true,
    ctrlKey: true,
    metaKey: true,
  });
  promoteTimelinePointer(original, target);
  expect(received).toHaveLength(1);
  const promoted = received[0]!;
  expect(promoted).not.toBe(original);
  expect(promoted.target).toBe(target);
  expect([
    promoted.pointerId,
    promoted.pointerType,
    promoted.button,
    promoted.buttons,
    promoted.clientX,
    promoted.clientY,
    promoted.shiftKey,
    promoted.altKey,
    promoted.ctrlKey,
    promoted.metaKey,
  ]).toEqual([42, "pen", 2, 2, 317.25, 183.5, true, true, true, true]);
  expect(promoted.bubbles).toBe(true);
  expect(promoted.cancelable).toBe(true);
  expect(promoted.defaultPrevented).toBe(true);
  expect(original.defaultPrevented).toBe(false);
  expect(bubbled).toHaveBeenCalledOnce();
});
