import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CanvasTimelineOverlay } from "../../../../src/components/motion/canvas/overlay";
import { overlayFixture } from "./overlay-support";
const state = vi.hoisted(() => ({
  down: vi.fn(),
  click: vi.fn(),
  fade: vi.fn(),
  context: vi.fn(),
  move: vi.fn(),
  render: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
  show: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  read: vi.fn(() => null),
  mix: vi.fn<() => unknown>(() => null),
}));
vi.mock("../../../../src/services/motion/audio/commit-policy", () => ({
  classifyAudioMixChange: state.mix,
}));
vi.mock("../../../../src/components/motion/audio/gestures", () => ({
  createAudioTrackGestures: () => ({
    begin: state.down,
    cancel: state.cancel,
    readPreview: state.read,
    subscribePreview: state.subscribe,
  }),
}));
vi.mock("../../../../src/state/motion/hover", () => ({
  createTimelineHoverSource: () => ({ show: state.show }),
}));
vi.mock("../../../../src/components/motion/canvas/overlay-target", () => ({
  CanvasTimelineTarget: ({ hit }: { hit: { trackId?: string; keyId?: string; kind?: string } }) => {
    state.render(hit);
    return (
      <div className="motion-canvas-active-overlay" key={hit.trackId ?? hit.keyId}>
        <button
          className={
            hit.kind === "key"
              ? "motion-key"
              : hit.kind === "easing"
                ? "motion-easing-segment"
                : "motion-track"
          }
          data-slot="context-menu-trigger"
          type="button"
          onPointerDown={state.down}
          onClick={state.click}
          onContextMenu={state.context}
          onPointerMove={state.move}
        >
          {hit.trackId ?? hit.keyId}
        </button>
        <button className="motion-gap-add" type="button" />
        <button
          className="motion-audio-fade-trigger"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={state.fade}
        />
      </div>
    );
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.down.mockReset();
  state.mix.mockReturnValue(null);
  state.show.mockImplementation(() => state.clear);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  document.querySelectorAll(".motion-timeline-scroll").forEach((node) => node.remove());
});
const dwell = (milliseconds = 64) =>
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });

it("promotes a cold click once, keeps the control through pointer capture and cleans subscriptions", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerDown(d.root, { button: 0, buttons: 1, pointerId: 7, clientX: 30, clientY: 12 });
  expect(state.down).toHaveBeenCalledOnce();
  const button = d.root.querySelector("button")!;
  d.point({
    kind: "clip",
    trackId: "second",
    layerId: "hero",
    rowKey: "hero",
    rowIndex: 0,
    bounds: { x: 200, y: 3, width: 100, height: 18 },
  });
  fireEvent.pointerMove(d.root, { buttons: 1, pointerId: 7, clientX: 31, clientY: 12 });
  expect(d.root.querySelector("button")).toBe(button);
  fireEvent.pointerUp(window, { button: 0, pointerId: 7 });
  fireEvent.click(d.root, { detail: 1, clientX: 30, clientY: 12 });
  expect(state.click).toHaveBeenCalledOnce();
  view.unmount();
  expect(state.cancel).toHaveBeenCalled();
  expect(state.clear).toHaveBeenCalled();
  expect(d.host.setHoverHit).toHaveBeenLastCalledWith(null);
  const calls = state.show.mock.calls.length;
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 50, clientY: 12 });
  expect(state.show.mock.calls.length).toBe(calls);
});

it("retains a keyboard-focused target when the pointer moves to a different occurrence", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 12 });
  dwell();
  const button = d.root.querySelector("button")!;
  button.focus();
  d.point({
    kind: "clip",
    trackId: "second",
    layerId: "hero",
    rowKey: "hero",
    rowIndex: 0,
    bounds: { x: 200, y: 3, width: 100, height: 18 },
  });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 230, clientY: 12 });
  expect(document.activeElement).toBe(button);
  expect(button.isConnected).toBe(true);
  view.unmount();
});

it("rebases observed document revisions so a later selection cannot retire an admitted gesture", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  act(() => d.engine.execute({ type: "setMotionDuration", duration: { value: 5, rate: 1 } }));
  state.down.mockImplementation(() => d.engine.select([d.layer.id]));
  fireEvent.pointerDown(d.root, { button: 0, buttons: 1, pointerId: 9, clientX: 30, clientY: 12 });
  expect(state.down).toHaveBeenCalledOnce();
  expect(d.root.querySelector("button")).not.toBeNull();
  expect(d.engine.getSnapshot().selection).toEqual([d.layer.id]);
  view.unmount();
});

it("hands a cold right-click to the newly admitted context target without promoting a drag", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerDown(d.root, { button: 2, buttons: 2, pointerId: 4, clientX: 30, clientY: 12 });
  expect(state.render).not.toHaveBeenCalled();
  fireEvent.contextMenu(d.root, { button: 2, clientX: 30, clientY: 12 });
  expect(state.context).toHaveBeenCalledOnce();
  expect(state.down).not.toHaveBeenCalled();
  view.unmount();
});
it("compensates both native scroll axes on the single semantic overlay wrapper", () => {
  const d = overlayFixture();
  d.viewport.scrollLeft = 60;
  d.viewport.scrollTop = 24;
  const view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  const overlay = d.root.querySelector<HTMLElement>(".motion-canvas-overlays")!;
  expect(overlay.style.transform).toBe("translate(-60px, -24px)");
  d.viewport.scrollLeft = 120;
  d.viewport.scrollTop = 48;
  fireEvent.scroll(d.viewport);
  expect(overlay.style.transform).toBe("translate(-120px, -48px)");
  view.unmount();
});

it("routes a clip hit to its clip control even when a transient ghost receives the native input", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 12 });
  dwell();
  fireEvent.pointerDown(d.root.querySelector(".motion-gap-add")!, {
    button: 0,
    buttons: 1,
    pointerId: 11,
    clientX: 30,
    clientY: 12,
  });
  expect(state.down).toHaveBeenCalledOnce();
  expect(state.down.mock.calls[0]![0].target).toBe(d.root.querySelector(".motion-track"));
  view.unmount();
});

it("retains an admitted audio editor only for a classified scalar mix publication", () => {
  const d = overlayFixture();
  d.point({
    kind: "audio",
    trackId: "sound",
    rowKey: "sound",
    rowIndex: 2,
    bounds: { x: 0, y: 48, width: 100, height: 18 },
  });
  const view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 60 });
  const target = d.root.querySelector("button")!;
  state.mix.mockReturnValue({ changes: [{ trackId: "sound", volume: 0.25, mute: false }] });
  act(() => d.engine.execute({ type: "setMotionDuration", duration: { value: 5, rate: 1 } }));
  expect(d.root.querySelector("button")).toBe(target);
  view.rerender(<CanvasTimelineOverlay {...d.props} interactive={false} />);
  view.rerender(<CanvasTimelineOverlay {...d.props} />);
  const resumed = d.root.querySelector("button")!;
  act(() => d.engine.execute({ type: "setMotionDuration", duration: { value: 6, rate: 1 } }));
  expect(d.root.querySelector("button")).toBe(resumed);
  state.mix.mockReturnValue(null);
  act(() => d.engine.execute({ type: "setMotionDuration", duration: { value: 7, rate: 1 } }));
  expect(d.root.querySelector("button")).toBeNull();
  view.unmount();
});

it("leaves explicit audio fade commands with their own DOM button instead of promoting a track gesture", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 12 });
  dwell();
  const button = d.root.querySelector(".motion-audio-fade-trigger")!;
  fireEvent.pointerDown(button, { button: 0, buttons: 1, pointerId: 13, clientX: 30, clientY: 12 });
  fireEvent.pointerUp(window, { button: 0, pointerId: 13 });
  fireEvent.click(button, { detail: 1 });
  expect(state.fade).toHaveBeenCalledOnce();
  expect(state.down).not.toHaveBeenCalled();
  expect(state.click).not.toHaveBeenCalled();
  view.unmount();
});
it("keeps fast sweeps imperative and admits a stable ordinary hover only after its original dwell", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  for (let at = 0; at < 8; at++) {
    d.point({
      kind: "clip",
      trackId: `sweep-${at}`,
      layerId: "hero",
      rowKey: "hero",
      rowIndex: 0,
      bounds: { x: at * 10, y: 3, width: 100, height: 18 },
    });
    fireEvent.pointerMove(d.root, { buttons: 0, clientX: at * 10, clientY: 12 });
    dwell(8);
  }
  expect(state.render).not.toHaveBeenCalled();
  expect(d.host.setHoverHit).toHaveBeenCalledTimes(8);
  expect(vi.getTimerCount()).toBe(1);
  dwell(24);
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 75, clientY: 12 });
  dwell(31);
  expect(state.render).not.toHaveBeenCalled();
  dwell(1);
  expect(state.render).toHaveBeenCalledOnce();
  expect(state.move).toHaveBeenCalledOnce();
  expect(state.down).not.toHaveBeenCalled();
  expect(state.click).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});
it("lets a cold intent supersede a queued hover without later admitting the stale target", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 12 });
  d.point({
    kind: "clip",
    trackId: "second",
    layerId: "hero",
    rowKey: "hero",
    rowIndex: 0,
    bounds: { x: 200, y: 3, width: 100, height: 18 },
  });
  fireEvent.pointerDown(d.root, {
    button: 0,
    buttons: 1,
    pointerId: 19,
    clientX: 230,
    clientY: 12,
  });
  expect(state.render).toHaveBeenCalledOnce();
  expect(d.root.querySelector(".motion-track")).toHaveTextContent("second");
  expect(state.down).toHaveBeenCalledOnce();
  dwell(200);
  expect(state.render).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});
it("rehits before dwell admission and forwards a stale overlay's context menu to the current clip", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 12 });
  d.point({
    kind: "clip",
    trackId: "second",
    layerId: "hero",
    rowKey: "hero",
    rowIndex: 0,
    bounds: { x: 200, y: 3, width: 100, height: 18 },
  });
  dwell();
  expect(state.render).not.toHaveBeenCalled();
  dwell();
  expect(d.root.querySelector(".motion-track")).toHaveTextContent("second");
  const oldSurface = d.root.querySelector(".motion-canvas-active-overlay")!;
  d.point({
    kind: "clip",
    trackId: "third",
    layerId: "hero",
    rowKey: "hero",
    rowIndex: 0,
    bounds: { x: 300, y: 3, width: 100, height: 18 },
  });
  fireEvent.pointerMove(oldSurface, { buttons: 0, clientX: 330, clientY: 12 });
  expect(d.root.querySelector(".motion-track")).toHaveTextContent("second");
  fireEvent.contextMenu(oldSurface, { button: 2, clientX: 330, clientY: 12 });
  expect(state.context).toHaveBeenCalledOnce();
  expect(state.context.mock.calls[0]![0].target).toHaveTextContent("third");
  expect(state.down).not.toHaveBeenCalled();
  dwell(200);
  expect(d.root.querySelector(".motion-track")).toHaveTextContent("third");
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});
it("cancels pending semantic work on leave, scroll, document replacement and unmount", () => {
  const d = overlayFixture(),
    view = render(<CanvasTimelineOverlay {...d.props} />, { container: d.root });
  const hover = () => fireEvent.pointerMove(d.root, { buttons: 0, clientX: 30, clientY: 12 });
  hover();
  fireEvent.pointerLeave(d.root);
  dwell();
  expect(state.render).not.toHaveBeenCalled();
  hover();
  fireEvent.scroll(d.viewport);
  dwell();
  expect(state.render).not.toHaveBeenCalled();
  hover();
  act(() => d.engine.execute({ type: "setMotionDuration", duration: { value: 5, rate: 1 } }));
  dwell();
  expect(state.render).not.toHaveBeenCalled();
  hover();
  view.unmount();
  dwell();
  expect(state.render).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
