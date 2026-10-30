import "../../../../src/state/i18n";
import { expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  AudioRowView,
  type AudioRowViewProps,
} from "../../../../src/components/motion/audio/AudioRowView";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { audioFixture } from "../../../support/audio";
function setup() {
  const d = audioFixture(),
    project = d.engine.getSnapshot().project;
  const props: AudioRowViewProps = {
    engine: d.engine,
    project,
    pageId: d.engine.getSnapshot().pageId,
    track: d.track(),
    asset: project.assets.sound as typeof d.asset,
    gestures: {
      begin: vi.fn(),
      cancel: vi.fn(),
      readPreview: vi.fn(() => null),
      subscribePreview: vi.fn(() => () => {}),
    },
    top: 48,
    rowHeight: 24,
    scale: 120,
    duration: 3,
    left: 0,
    width: 300,
    active: true,
    selected: true,
    unit: "ms",
    onSelect: vi.fn(),
  };
  return { d, props };
}
it("keeps audio outside visual hierarchy and retains the existing controls and trim readout", () => {
  const { d, props } = setup(),
    view = render(
      <TooltipProvider>
        <AudioRowView {...props} />
      </TooltipProvider>,
    ),
    row = view.container.querySelector<HTMLElement>(".motion-audio-row")!;
  expect(row.dataset.audioTrackId).toBe(d.track().id);
  expect(row.hasAttribute("data-layer-drop-id")).toBe(false);
  expect(row.style.top).toBe("48px");
  expect(view.container.querySelectorAll(".motion-trim-handle")).toHaveLength(2);
  expect(
    view.container.querySelector("[data-motion-clip-id]")?.getAttribute("data-motion-clip-id"),
  ).toBe(d.track().id);
  fireEvent.click(row.querySelector(".motion-row-name")!);
  expect(props.onSelect).toHaveBeenCalledWith(d.track().id);
  view.unmount();
});
it("refuses stale same-ID project/track callbacks and accepts the fresh canonical scope", () => {
  const { d, props } = setup(),
    view = render(
      <TooltipProvider>
        <AudioRowView {...props} />
      </TooltipProvider>,
    );
  d.engine.load(structuredClone(props.project));
  const snapshot = d.engine.getSnapshot();
  const row = view.container.querySelector<HTMLElement>(".motion-audio-row")!,
    clip = row.querySelector<HTMLElement>(".motion-audio-track")!;
  fireEvent.click(row.querySelector(".motion-row-name")!);
  fireEvent.pointerDown(clip, { button: 0, pointerId: 1 });
  fireEvent.keyDown(row, { key: "Delete" });
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(props.gestures.begin).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(snapshot);
  view.rerender(
    <TooltipProvider>
      <AudioRowView
        {...props}
        project={snapshot.project}
        pageId={snapshot.pageId}
        track={d.track()}
        asset={snapshot.project.assets.sound as typeof d.asset}
      />
    </TooltipProvider>,
  );
  fireEvent.click(row.querySelector(".motion-row-name")!);
  expect(props.onSelect).toHaveBeenCalledOnce();
  view.unmount();
});
it("keeps rename, volume, selection and keyboard deletion while omitting all temporal DOM in labelsOnly", () => {
  const { d, props } = setup(),
    view = render(
      <TooltipProvider>
        <AudioRowView {...props} labelsOnly />
      </TooltipProvider>,
    ),
    row = view.container.querySelector<HTMLElement>(".motion-audio-row")!;
  expect(row).toHaveAttribute("data-labels-only", "true");
  expect(
    row.querySelector(".motion-row-time,.motion-track,.motion-trim-handle,.motion-audio-waveform"),
  ).toBeNull();
  expect(row.querySelector(".motion-row-label")).toHaveStyle({ pointerEvents: "auto" });
  expect(row.querySelector(".motion-audio-gain")).not.toBeNull();
  fireEvent.click(row.querySelector(".motion-row-name")!);
  expect(props.onSelect).toHaveBeenCalledWith(d.track().id);
  fireEvent.keyDown(row, { key: "Delete" });
  expect(d.page().motion!.audioTracks).toHaveLength(0);
  d.engine.undo();
  expect(d.page().motion!.audioTracks).toHaveLength(1);
  expect(props.gestures.begin).not.toHaveBeenCalled();
  view.unmount();
});
