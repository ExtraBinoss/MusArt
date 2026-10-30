import "../../../src/state/i18n";
import { useRef, type ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { TimelineVirtualRows } from "../../../src/components/motion/TimelineVirtualRows";
import { projectTimelineRows } from "../../../src/components/motion/tree";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { audioFixture } from "../../support/audio";
const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
  overlay: vi.fn(),
  visualName: vi.fn(),
  audioName: vi.fn(),
}));
vi.mock("../../../src/components/motion/canvas/surface", () => ({
  createTimelineCanvasSurface: () => {
    state.create();
    return {
      update: state.update,
      dispose: state.dispose,
      invalidate: vi.fn(),
      hitTest: vi.fn(() => null),
    };
  },
}));
vi.mock("../../../src/components/motion/canvas/overlay", () => ({
  CanvasTimelineOverlay: (props: unknown) => {
    state.overlay(props);
    return null;
  },
}));
vi.mock("../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => null,
}));
vi.mock("../../../src/components/motion/TimelineLayerName", async (load) => {
  const actual = await load<typeof import("../../../src/components/motion/TimelineLayerName")>();
  return {
    TimelineLayerName(props: ComponentProps<typeof actual.TimelineLayerName>) {
      state.visualName(props);
      return <actual.TimelineLayerName {...props} />;
    },
  };
});
vi.mock("../../../src/components/motion/audio/AudioTrackName", async (load) => {
  const actual = await load<typeof import("../../../src/components/motion/audio/AudioTrackName")>();
  return {
    AudioTrackName(props: ComponentProps<typeof actual.AudioTrackName>) {
      state.audioName(props);
      return <actual.AudioTrackName {...props} />;
    },
  };
});

it("admits bounded audio windows without rerendering its owner or editing the document", () => {
  const d = audioFixture(100),
    transport = createMotionTransport(d.engine);
  const snapshot = d.engine.getSnapshot();
  let ownerRenders = 0;
  function Owner() {
    ownerRenders++;
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <div ref={viewport} data-testid="viewport">
        <TimelineVirtualRows
          viewport={viewport}
          engine={d.engine}
          compositionId={snapshot.pageId}
          rows={[]}
          audioTracks={d.page().motion!.audioTracks!}
          assets={snapshot.project.assets}
          onAudioError={vi.fn()}
          rowHeight={24}
          selected={new Set()}
          pixelsPerSecond={120}
          duration={3}
          left={0}
          width={600}
          unit="ms"
          transport={transport}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
          interactive
        />
      </div>
    );
  }
  const view = render(
    <TooltipProvider>
      <Owner />
    </TooltipProvider>,
  );
  try {
    const ownerBefore = ownerRenders;
    const updatesBefore = state.update.mock.calls.length;
    const viewport = screen.getByTestId("viewport");
    expect(view.container.querySelector(".motion-row-space")).toHaveStyle({ height: "2400px" });
    act(() => {
      viewport.scrollTop = 1200;
      viewport.dispatchEvent(new Event("scroll"));
      expect(
        view.container.querySelector<HTMLElement>(".motion-audio-row")!.dataset.audioTrackId,
      ).toBe("audio-45");
    });
    const rows = view.container.querySelectorAll<HTMLElement>(".motion-audio-row");
    expect(rows.length).toBeLessThan(30);
    expect(rows[0]!.dataset.audioTrackId).toBe("audio-45");
    expect(rows[0]!.style.top).toBe("1080px");
    act(() => {
      viewport.scrollTop = 0;
      viewport.dispatchEvent(new Event("scroll"));
      expect(
        view.container.querySelector<HTMLElement>(".motion-audio-row")!.dataset.audioTrackId,
      ).toBe("audio-0");
    });
    expect(
      view.container.querySelector<HTMLElement>(".motion-audio-row")!.dataset.audioTrackId,
    ).toBe("audio-0");
    expect(ownerRenders).toBe(ownerBefore);
    expect(state.create).toHaveBeenCalledOnce();
    expect(state.update).toHaveBeenCalledTimes(updatesBefore);
    expect(
      view.container.querySelector(
        ".motion-row-time,.motion-key,.motion-track,.motion-audio-waveform",
      ),
    ).toBeNull();
    expect(view.container.querySelector("canvas[data-timeline-canvas=true]")).not.toBeNull();
    expect(d.engine.getSnapshot()).toBe(snapshot);
  } finally {
    view.unmount();
    transport.dispose();
  }
});

it("retains visual and audio names through zoom, horizontal windows and unit previews while the canvas stays live", () => {
  const d = audioFixture(2);
  d.engine.execute({ type: "addLayers", layers: [createLayer("rectangle", { name: "Visual" })] });
  const transport = createMotionTransport(d.engine),
    snapshot = d.engine.getSnapshot(),
    page = d.page(),
    props = {
      engine: d.engine,
      compositionId: page.id,
      rows: projectTimelineRows(page, new Set()),
      audioTracks: page.motion!.audioTracks!,
      assets: snapshot.project.assets,
      onAudioError: vi.fn(),
      rowHeight: 24,
      selected: new Set<string>(),
      pixelsPerSecond: 120,
      duration: 3,
      left: 0,
      width: 600,
      unit: "ms" as const,
      transport,
      onToggle: vi.fn(),
      onSelect: vi.fn(),
      onZoomRange: vi.fn(),
      interactive: true,
    };
  function Owner({
    value,
  }: {
    value: Omit<ComponentProps<typeof TimelineVirtualRows>, "viewport">;
  }) {
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <div ref={viewport}>
        <TimelineVirtualRows {...value} viewport={viewport} />
      </div>
    );
  }
  const renderOwner = (value: Omit<ComponentProps<typeof TimelineVirtualRows>, "viewport">) => (
    <TooltipProvider>
      <Owner value={value} />
    </TooltipProvider>
  );
  const view = render(renderOwner(props));
  try {
    const visual = state.visualName.mock.calls.length,
      audio = state.audioName.mock.calls.length,
      names = Array.from(view.container.querySelectorAll(".motion-row-name")),
      zoomRange = vi.fn();
    expect(names).toHaveLength(3);
    expect(visual).toBeGreaterThan(0);
    expect(audio).toBeGreaterThanOrEqual(2);
    for (const scale of [160, 320, 480])
      view.rerender(
        renderOwner({
          ...props,
          pixelsPerSecond: scale,
          duration: 5,
          left: scale,
          width: 900,
          unit: "s",
          onZoomRange: zoomRange,
        }),
      );
    expect(state.visualName).toHaveBeenCalledTimes(visual);
    expect(state.audioName).toHaveBeenCalledTimes(audio);
    expect(Array.from(view.container.querySelectorAll(".motion-row-name"))).toEqual(names);
    expect(state.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 480, duration: 5 }),
    );
    expect(state.overlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ onZoomRange: zoomRange, unit: "s" }),
    );
    expect(d.engine.getSnapshot()).toBe(snapshot);

    const bodies = state.overlay.mock.calls.length;
    const updates = state.update.mock.calls.length;
    for (const left of [600, 1200, 2400])
      view.rerender(
        renderOwner({
          ...props,
          pixelsPerSecond: 480,
          duration: 5,
          left,
          width: 1100,
          unit: "s",
          onZoomRange: zoomRange,
        }),
      );
    expect(state.overlay).toHaveBeenCalledTimes(bodies);
    expect(state.update).toHaveBeenCalledTimes(updates);

    const onSelect = vi.fn();
    view.rerender(renderOwner({ ...props, onSelect }));
    fireEvent.click(names[0]!);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(page.layers[0]!.id, false);
    const replacement = structuredClone(snapshot.project);
    replacement.pages[0]!.layers[0]!.name = "Reopened visual";
    replacement.pages[0]!.motion!.audioTracks![0]!.name = "Reopened sound";
    act(() => d.engine.load(replacement));
    const reopened = d.page();
    view.rerender(
      renderOwner({
        ...props,
        onSelect,
        rows: projectTimelineRows(reopened, new Set()),
        audioTracks: reopened.motion!.audioTracks!,
        assets: d.engine.getSnapshot().project.assets,
      }),
    );
    expect(view.container.querySelector(".motion-row-name")).toHaveTextContent("Reopened visual");
    expect(view.container.querySelector(".motion-audio-row .motion-row-name")).toHaveTextContent(
      "Reopened sound",
    );
    expect(state.visualName.mock.calls.length).toBeGreaterThan(visual);
    expect(state.audioName.mock.calls.length).toBeGreaterThan(audio);
    expect(view.container.querySelector(".motion-row-time,.motion-key,.motion-track")).toBeNull();
  } finally {
    view.unmount();
    transport.dispose();
  }
});
