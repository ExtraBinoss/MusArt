import { afterEach, expect, it, vi } from "vitest";
import { installTimelineCanvasDropTarget } from "../../../../src/components/motion/canvas/drop-target";
import { overlayFixture } from "./overlay-support";
import { createTimelineCanvasRowPositions } from "../../../../src/components/motion/canvas/row-positions";

afterEach(() => {
  document.querySelectorAll(".motion-timeline-scroll").forEach((node) => node.remove());
  delete document.documentElement.dataset.layerReorderActive;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const d = overlayFixture();
  const callbacks: (() => void)[] = [],
    disconnected = vi.fn();
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnected;
    },
  );
  vi.spyOn(d.root, "getBoundingClientRect").mockReturnValue({
    x: 244,
    y: 32,
    left: 244,
    top: 32,
    right: 644,
    bottom: 128,
    width: 400,
    height: 96,
    toJSON: () => ({}),
  });
  const dispose = installTimelineCanvasDropTarget({ host: d.host, compositionId: d.page.id });
  const proxy = () => d.root.querySelector<HTMLElement>("[data-timeline-drop-target]")!;
  const move = (x: number, y: number) =>
    d.root.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: x,
        clientY: y,
      }),
    );
  const active = (value: boolean) => {
    if (value) document.documentElement.dataset.layerReorderActive = "true";
    else delete document.documentElement.dataset.layerReorderActive;
    callbacks.forEach((callback) => callback());
  };
  return { ...d, callbacks, disconnected, dispose, proxy, move, active };
}
it("uses a captured point before reorder activation and exposes exactly one semantic row", () => {
  const d = fixture(),
    raf = vi.spyOn(window, "requestAnimationFrame");
  d.move(300, 44);
  expect(d.proxy().hidden).toBe(true);
  d.active(true);
  expect(d.proxy().hidden).toBe(false);
  expect(d.proxy().dataset).toMatchObject({
    layerDropId: "hero",
    layerDropPageId: d.page.id,
    layerDropKind: "layer",
  });
  expect(d.proxy().getAttribute("aria-hidden")).toBe("true");
  expect(d.proxy().style).toMatchObject({
    top: "0px",
    height: "24px",
    width: "400px",
    zIndex: "4",
    pointerEvents: "auto",
  });
  d.move(300, 68);
  expect(d.proxy().dataset.layerDropKind).toBe("property");
  expect(d.proxy().style.top).toBe("24px");
  expect(d.root.querySelectorAll("[data-timeline-drop-target]")).toHaveLength(1);
  d.active(false);
  expect(d.proxy().hidden).toBe(true);
  expect(d.proxy().dataset.layerDropId).toBeUndefined();
  expect(raf).not.toHaveBeenCalled();
  d.dispose();
});
it("updates geometry from the last point on scroll and excludes audio or outside coordinates", () => {
  const d = fixture();
  d.active(true);
  d.move(300, 44);
  d.viewport.scrollTop = 24;
  d.viewport.dispatchEvent(new Event("scroll"));
  expect(d.proxy().dataset.layerDropKind).toBe("property");
  expect(d.proxy().style.top).toBe("0px");
  d.model({ ...d.host.readModel(), audioTracks: [d.audio] });
  d.viewport.scrollTop = 48;
  d.viewport.dispatchEvent(new Event("scroll"));
  expect(d.proxy().hidden).toBe(true);
  d.move(240, 44);
  expect(d.proxy().hidden).toBe(true);
  d.move(300, 130);
  expect(d.proxy().hidden).toBe(true);
  d.dispose();
});
it("replacement epochs clean old observers and cannot let a late cleanup remove the new proxy", () => {
  const d = fixture();
  d.move(300, 44);
  d.active(true);
  const old = d.proxy(),
    oldEpoch = d.root.dataset.timelineDropTargetEpoch;
  const replacement = installTimelineCanvasDropTarget({ host: d.host, compositionId: "new-page" });
  expect(old.isConnected).toBe(false);
  expect(d.disconnected).toHaveBeenCalledOnce();
  expect(d.root.dataset.timelineDropTargetEpoch).not.toBe(oldEpoch);
  d.dispose();
  d.move(300, 44);
  d.callbacks.forEach((callback) => callback());
  expect(d.proxy().dataset.layerDropPageId).toBe("new-page");
  expect(d.root.querySelectorAll("[data-timeline-drop-target]")).toHaveLength(1);
  replacement();
  d.callbacks.forEach((callback) => callback());
  expect(d.root.querySelector("[data-timeline-drop-target]")).toBeNull();
  expect(d.root.dataset.timelineDropTargetEpoch).toBeUndefined();
});
it("hides a departed root and disconnects all input work after unmount", () => {
  const d = fixture();
  d.move(300, 44);
  d.active(true);
  const node = d.proxy();
  d.root.remove();
  d.callbacks.forEach((callback) => callback());
  expect(node.hidden).toBe(true);
  d.dispose();
  d.move(300, 44);
  d.viewport.dispatchEvent(new Event("scroll"));
  expect(node.isConnected).toBe(false);
  expect(d.disconnected).toHaveBeenCalledOnce();
  expect(d.root.dataset.timelineDropTargetEpoch).toBeUndefined();
  d.host.root.current = null;
  expect(() =>
    installTimelineCanvasDropTarget({ host: d.host, compositionId: d.page.id })(),
  ).not.toThrow();
});
it("tracks the published painted pose and source stacking rather than the destination index", () => {
  const d = fixture();
  const onPoseChange = vi.fn();
  d.dispose();
  const dispose = installTimelineCanvasDropTarget({
    host: d.host,
    compositionId: d.page.id,
    onPoseChange,
  });
  const label = document.createElement("div");
  label.dataset.labelsOnly = "true";
  label.dataset.motionRowKey = "hero";
  label.dataset.layerReorderSource = "true";
  const rect = vi
    .spyOn(label, "getBoundingClientRect")
    .mockReturnValue({ top: 50, height: 24 } as DOMRect);
  d.viewport.append(label);
  const reader = createTimelineCanvasRowPositions(d.root);
  d.active(true);
  d.move(300, 60);
  reader.read(d.viewport, 24, 96);
  expect(d.proxy().dataset.layerDropId).toBe("hero");
  expect(d.proxy().dataset.timelineRowIndex).toBe("0");
  expect(d.proxy().style.top).toBe("18px");
  expect(onPoseChange).toHaveBeenCalledOnce();
  rect.mockReturnValue({ top: 54, height: 24 } as DOMRect);
  reader.read(d.viewport, 24, 96);
  expect(d.proxy().style.top).toBe("22px");
  reader.dispose();
  dispose();
});
