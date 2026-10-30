import "../../../../src/state/i18n";
import { StrictMode, useRef } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasTimelineBody } from "../../../../src/components/motion/canvas/CanvasTimelineBody";
import type { TimelineCanvasHost } from "../../../../src/components/motion/canvas/host";
import type { TimelineGestures } from "../../../../src/components/motion/gestures";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { audioFixture } from "../../../support/audio";
import type { TimelineTransport } from "../../../../src/components/motion/model";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
  session: null as null | {
    preparation: { waveform: ReturnType<typeof vi.fn>; holdWaveforms: ReturnType<typeof vi.fn> };
  },
}));
vi.mock("../../../../src/components/motion/canvas/surface", () => ({
  createTimelineCanvasSurface(options: unknown) {
    state.create(options);
    return {
      update: state.update,
      dispose: state.dispose,
      invalidate: vi.fn(),
      hitTest: vi.fn(() => null),
    };
  },
}));
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => state.session,
}));
vi.mock("../../../../src/components/motion/canvas/overlay", () => ({
  CanvasTimelineOverlay: () => <div data-testid="overlay" />,
}));
afterEach(() => {
  state.session = null;
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("connects after the parent viewport ref attaches and paints gesture previews without React frame renders", () => {
  const d = audioFixture(),
    transport = createMotionTransport(d.engine),
    snapshot = d.engine.getSnapshot(),
    listeners = new Set<() => void>();
  let keys: ReadonlySet<string> = new Set(),
    draft: ReturnType<TimelineGestures["readPreview"]> = null,
    selectionPreview: ReturnType<TimelineGestures["readMarqueePreview"]> = null,
    renders = 0;
  const captured: { host: TimelineCanvasHost | null } = { host: null };
  const gestures = {
    readSelected: () => keys,
    readPreview: () => draft,
    readMarqueePreview: () => selectionPreview,
    subscribePreview(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  } as unknown as TimelineGestures;
  const onAudioError = vi.fn();
  function Owner({ gutter }: { gutter?: number }) {
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <div ref={viewport}>
        <CanvasTimelineBody
          viewport={viewport}
          engine={d.engine}
          compositionId={snapshot.pageId}
          rows={[]}
          audioTracks={d.page().motion!.audioTracks!}
          assets={snapshot.project.assets}
          selected={new Set()}
          pixelsPerSecond={120}
          duration={3}
          rowHeight={24}
          gutter={gutter}
          transport={transport}
          gestures={gestures}
          unit="ms"
          onSelect={vi.fn()}
          onAudioError={onAudioError}
        >
          {(value) => {
            captured.host = value;
            renders++;
            return <div data-testid="labels" />;
          }}
        </CanvasTimelineBody>
      </div>
    );
  }
  const view = render(<Owner />);
  expect(state.create).toHaveBeenCalledOnce();
  expect(view.container.querySelector("canvas")).toHaveAttribute("data-timeline-canvas", "true");
  expect(view.container.querySelector(".motion-canvas-frame")).not.toBeNull();
  expect(view.container.querySelector(".motion-canvas-root")).toHaveAttribute("role", "group");
  expect(view.container.querySelector(".motion-canvas-root")).toHaveAttribute("tabindex", "0");
  expect(view.container.querySelector(".motion-canvas-root")).toHaveAccessibleName(
    /sélectionner|select/i,
  );
  expect(captured.host!.readModel().gutter).toBe(244);
  view.rerender(<Owner gutter={120} />);
  expect(captured.host!.readModel().gutter).toBe(120);
  expect(state.create).toHaveBeenCalledOnce();
  expect(state.update).toHaveBeenLastCalledWith(expect.objectContaining({ gutter: 120 }));
  const before = renders;
  act(() => {
    keys = new Set(["one"]);
    draft = { action: "keys", delta: { value: 1, rate: 2 }, keyIds: keys, layerIds: new Set() };
    selectionPreview = {
      ranges: [
        {
          propertyId: "property",
          row: 0,
          layerId: "visual",
          keys: [{ id: "one", time: { value: 0, rate: 1 }, value: 0 }],
          first: 0,
          after: 1,
        },
      ],
      base: new Set(),
    };
    for (const listener of listeners) listener();
  });
  expect(state.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedKeyIds: keys, draft, selectionPreview }),
  );
  expect(renders).toBe(before);
  act(() => captured.host!.selectAudio("audio-0"));
  expect(captured.host!.readSelectedAudio()).toBe("audio-0");
  expect(renders).toBe(before);
  expect(d.engine.getSnapshot()).toBe(snapshot);
  view.unmount();
  expect(listeners.size).toBe(0);
  expect(state.dispose).toHaveBeenCalledOnce();
  transport.dispose();
});
it("recreates retired native surfaces during StrictMode effect replay and disposes every lease", () => {
  const d = audioFixture(),
    transport = createMotionTransport(d.engine),
    snapshot = d.engine.getSnapshot();
  function Owner() {
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <div ref={viewport}>
        <CanvasTimelineBody
          viewport={viewport}
          engine={d.engine}
          compositionId={snapshot.pageId}
          rows={[]}
          audioTracks={[]}
          assets={snapshot.project.assets}
          selected={new Set()}
          pixelsPerSecond={120}
          duration={3}
          rowHeight={24}
          transport={transport}
          unit="ms"
          onSelect={vi.fn()}
          onAudioError={vi.fn()}
        >
          {() => null}
        </CanvasTimelineBody>
      </div>
    );
  }
  const view = render(
    <StrictMode>
      <Owner />
    </StrictMode>,
  );
  expect(state.create.mock.calls.length).toBeGreaterThan(0);
  expect(state.dispose.mock.calls.length).toBe(state.create.mock.calls.length - 1);
  view.unmount();
  expect(state.dispose.mock.calls.length).toBe(state.create.mock.calls.length);
  transport.dispose();
});
it("combines idle activity and Play in one preparation hold and cleans a held pointer on unmount", () => {
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const release = vi.fn(),
    waveform = vi.fn(() => new Promise<Float32Array>(() => {})),
    holdWaveforms = vi.fn(() => release);
  state.session = { preparation: { waveform, holdWaveforms } };
  const d = audioFixture(),
    base = createMotionTransport(d.engine),
    listeners = new Set<() => void>();
  let playing = false;
  const transport: TimelineTransport = {
    read: () => ({ ...base.read(), playing }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setPlaybackMode: vi.fn(),
  };
  function Owner() {
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <div className="motion-timeline">
        <button className="motion-zoom" type="button" />
        <div ref={viewport} data-testid="viewport">
          <CanvasTimelineBody
            viewport={viewport}
            engine={d.engine}
            compositionId={d.page().id}
            rows={[]}
            audioTracks={d.page().motion!.audioTracks!}
            assets={d.engine.getSnapshot().project.assets}
            selected={new Set()}
            pixelsPerSecond={120}
            duration={3}
            rowHeight={24}
            transport={transport}
            unit="ms"
            onSelect={vi.fn()}
            onAudioError={vi.fn()}
          >
            {() => null}
          </CanvasTimelineBody>
        </div>
      </div>
    );
  }
  const view = render(<Owner />),
    viewport = view.getByTestId("viewport");
  Object.defineProperties(viewport, { clientWidth: { value: 644 }, clientHeight: { value: 80 } });
  act(() => {
    const jobs = [...frames];
    frames.clear();
    for (const [, callback] of jobs) callback(0);
  });
  expect(waveform).toHaveBeenCalledOnce();
  fireEvent.wheel(viewport, { deltaY: -100 });
  expect(holdWaveforms).toHaveBeenCalledOnce();
  act(() => {
    vi.advanceTimersByTime(170);
  });
  fireEvent.wheel(viewport, { deltaX: 100, ctrlKey: true });
  act(() => {
    playing = true;
    for (const listener of listeners) listener();
    vi.advanceTimersByTime(180);
  });
  expect(release).not.toHaveBeenCalled();
  expect(holdWaveforms).toHaveBeenCalledOnce();
  act(() => {
    playing = false;
    for (const listener of listeners) listener();
  });
  expect(release).toHaveBeenCalledOnce();
  const zoom = view.container.querySelector(".motion-zoom")!;
  fireEvent.pointerDown(zoom, { button: 0, pointerId: 3 });
  expect(holdWaveforms).toHaveBeenCalledTimes(2);
  fireEvent.pointerCancel(window, { pointerId: 3 });
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(release).toHaveBeenCalledTimes(2);
  fireEvent.pointerDown(zoom, { button: 0, pointerId: 4 });
  view.unmount();
  expect(release).toHaveBeenCalledTimes(3);
  expect(listeners.size).toBe(0);
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  base.dispose();
});
