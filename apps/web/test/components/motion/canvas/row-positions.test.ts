import { afterEach, expect, it, vi } from "vitest";
import {
  createTimelineCanvasRowPositions,
  getTimelineCanvasRowPositions,
  TIMELINE_ROW_POSITIONS_EVENT,
} from "../../../../src/components/motion/canvas/row-positions";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function rectangle(top: number, height = 24): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 200,
    width: 200,
    height,
    toJSON: () => ({}),
  };
}
function fixture(count = 2) {
  const viewport = document.createElement("div"),
    root = document.createElement("div");
  viewport.append(root);
  document.body.append(viewport);
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rectangle(100, 48));
  const labels = Array.from({ length: count }, (_, at) => {
    const node = document.createElement("div");
    node.dataset.labelsOnly = "true";
    node.dataset.motionRowKey = `row-${at}`;
    const rect = vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rectangle(100 + at * 24));
    viewport.append(node);
    return { node, rect };
  });
  return { viewport, root, labels, reader: createTimelineCanvasRowPositions(root) };
}
it("publishes actual transformed label geometry and animation state, excluding overlay controllers", () => {
  const d = fixture(),
    changed = vi.fn();
  d.root.addEventListener(TIMELINE_ROW_POSITIONS_EVENT, changed);
  d.viewport.scrollTop = 24;
  d.labels[0]!.rect.mockReturnValue(rectangle(112.5));
  d.labels[0]!.node.dataset.layerReorderSource = "true";
  Object.defineProperty(d.labels[0]!.node, "getAnimations", {
    value: () => [{ playState: "running", pending: false }],
  });
  const overlay = document.createElement("div"),
    fake = document.createElement("div");
  overlay.className = "motion-canvas-active-overlay";
  fake.dataset.labelsOnly = "true";
  fake.dataset.motionRowKey = "fake";
  const fakeRect = vi.spyOn(fake, "getBoundingClientRect");
  overlay.append(fake);
  d.root.append(overlay);
  const first = d.reader.read(d.viewport, 24, 48);
  expect(first.animating).toBe(true);
  expect(first.positions?.get("row-0")).toEqual({ top: 36.5, height: 24, zIndex: 4, order: 0 });
  expect(first.positions?.has("fake")).toBe(false);
  expect(fakeRect).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledOnce();
  d.reader.read(d.viewport, 24, 48);
  expect(changed).toHaveBeenCalledOnce();
  d.reader.dispose();
  expect(getTimelineCanvasRowPositions(d.root)).toBeNull();
});
it("bounds native rect reads to the visible label window and preserves a newer owner's snapshot", () => {
  const d = fixture(100);
  d.reader.read(d.viewport, 24, 48);
  expect(d.labels.reduce((count, label) => count + label.rect.mock.calls.length, 0)).toBe(14);
  const replacement = createTimelineCanvasRowPositions(d.root);
  replacement.read(d.viewport, 24, 48);
  const owned = getTimelineCanvasRowPositions(d.root);
  d.reader.dispose();
  expect(getTimelineCanvasRowPositions(d.root)).toBe(owned);
  expect(d.reader.read(d.viewport, 24, 48).positions).toBeNull();
  replacement.dispose();
  expect(getTimelineCanvasRowPositions(d.root)).toBeNull();
});
