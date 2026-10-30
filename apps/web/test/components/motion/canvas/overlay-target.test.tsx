import "../../../../src/state/i18n";
import "../../../../src/components/motion/messages";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CanvasTimelineTarget } from "../../../../src/components/motion/canvas/overlay-target";
import type { CanvasTimelineTargetProps } from "../../../../src/components/motion/canvas/overlay-model";
import type { TimelineCanvasHit } from "../../../../src/components/motion/canvas/model";
import { overlayFixture } from "./overlay-support";
const calls = vi.hoisted(() => ({
  clips: vi.fn(),
  key: vi.fn(),
  cluster: vi.fn(),
  easing: vi.fn(),
}));
vi.mock("../../../../src/components/motion/occurrences/TrackClips", () => ({
  TrackClips: (props: unknown) => {
    calls.clips(props);
    return <button data-testid="clip" />;
  },
}));
vi.mock("../../../../src/components/motion/KeyframeMarker", () => ({
  KeyframeMarker: (props: unknown) => {
    calls.key(props);
    return <button data-testid="key" />;
  },
}));
vi.mock("../../../../src/components/motion/KeyCluster", () => ({
  KeyCluster: (props: unknown) => {
    calls.cluster(props);
    return <button data-testid="cluster" />;
  },
}));
vi.mock("../../../../src/components/motion/easing/EasingPopover", () => ({
  EasingPopover: (props: { children: ReactNode }) => {
    calls.easing(props);
    return props.children;
  },
}));
vi.mock("../../../../src/components/motion/canvas/AudioCanvasTarget", () => ({
  AudioCanvasTarget: () => <span data-testid="audio" />,
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  document.querySelectorAll(".motion-timeline-scroll").forEach((node) => node.remove());
});
function fixture() {
  const d = overlayFixture();
  const props: CanvasTimelineTargetProps = {
    ...d.props,
    hit: d.hit(),
    audioGestures: d.audioGestures,
  };
  return { ...d, props };
}

it("mounts only the exact pointed occurrence and refuses a departed row identity", () => {
  const d = fixture();
  const hit: TimelineCanvasHit = {
    kind: "clip",
    layerId: "hero",
    trackId: "second",
    rowKey: "hero",
    rowIndex: 0,
    bounds: { x: 200, y: 3, width: 100, height: 18 },
  };
  const view = render(<CanvasTimelineTarget {...d.props} hit={hit} />);
  expect(calls.clips).toHaveBeenLastCalledWith(
    expect.objectContaining({ tracks: [d.tracks[1]], layerId: "hero", scale: 100 }),
  );
  expect(view.container.querySelectorAll(".motion-canvas-active-overlay")).toHaveLength(1);
  view.rerender(<CanvasTimelineTarget {...d.props} hit={{ ...hit, rowKey: "deleted-row" }} />);
  expect(view.container).toBeEmptyDOMElement();
  view.unmount();
});
it("routes key buckets and incoming easing to their exact property and destination", () => {
  const d = fixture();
  const common = {
    rowKey: "position",
    rowIndex: 1,
    layerId: "hero",
    trackId: "first",
    propertyId: "position",
    bounds: { x: 41, y: 27, width: 14, height: 18 },
  };
  const key: TimelineCanvasHit = {
    ...common,
    kind: "key",
    keyId: "a",
    firstKeyIndex: 0,
    afterKeyIndex: 1,
  };
  const view = render(<CanvasTimelineTarget {...d.props} hit={key} />);
  expect(calls.key).toHaveBeenLastCalledWith(
    expect.objectContaining({
      propertyId: "position",
      layerId: "hero",
      marker: expect.objectContaining({
        key: expect.objectContaining({ id: "a" }),
        firstKeyIndex: 0,
        afterKeyIndex: 1,
      }),
    }),
  );
  view.rerender(<CanvasTimelineTarget {...d.props} hit={{ ...key, afterKeyIndex: 2 }} />);
  expect(calls.cluster).toHaveBeenLastCalledWith(
    expect.objectContaining({ first: 0, after: 2, propertyId: "position" }),
  );
  d.viewport.scrollLeft = 60;
  Object.defineProperty(d.viewport, "clientWidth", { configurable: true, value: 344 });
  view.rerender(
    <CanvasTimelineTarget
      {...d.props}
      hit={{ ...common, kind: "easing", keyId: "b", previousKeyId: "a" }}
    />,
  );
  expect(calls.easing).toHaveBeenLastCalledWith(
    expect.objectContaining({ destination: expect.objectContaining({ id: "b" }) }),
  );
  expect(view.container.querySelector<HTMLElement>(".motion-easing-segment")?.style.left).toBe(
    "73px",
  );
  expect(view.container.querySelector<HTMLElement>(".motion-easing-segment")?.style.width).toBe(
    "14px",
  );
  view.rerender(
    <CanvasTimelineTarget
      {...d.props}
      model={{ ...d.host.readModel(), scale: 200 }}
      hit={{ ...common, kind: "easing", keyId: "b", previousKeyId: "a" }}
    />,
  );
  expect(view.container.querySelector<HTMLElement>(".motion-easing-segment")?.style.left).toBe(
    "103px",
  );
  view.unmount();
});
it("delegates audio without inventing a visual layer and leaves missing keys inert", () => {
  const d = fixture();
  const view = render(
    <CanvasTimelineTarget
      {...d.props}
      hit={{
        kind: "audio",
        rowKey: "sound",
        rowIndex: 2,
        trackId: "sound",
        bounds: { x: 0, y: 48, width: 100, height: 18 },
      }}
    />,
  );
  expect(view.getByTestId("audio")).toBeInTheDocument();
  view.rerender(
    <CanvasTimelineTarget
      {...d.props}
      hit={{
        kind: "key",
        layerId: "hero",
        trackId: "first",
        rowKey: "position",
        rowIndex: 1,
        propertyId: "position",
        keyId: "missing",
        firstKeyIndex: 0,
        afterKeyIndex: 1,
        bounds: { x: 0, y: 24, width: 18, height: 24 },
      }}
    />,
  );
  expect(calls.key).not.toHaveBeenCalled();
  expect(view.container.querySelector("button")).toBeNull();
  view.unmount();
});
