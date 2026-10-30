import "../../../../src/state/i18n";
import "../../../../src/components/motion/messages";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AudioCanvasTarget } from "../../../../src/components/motion/canvas/AudioCanvasTarget";
import type { CanvasTimelineTargetProps } from "../../../../src/components/motion/canvas/overlay-model";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { audioFixture } from "../../../support/audio";
import { overlayFixture } from "./overlay-support";
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => null,
}));
afterEach(() => {
  document.querySelectorAll(".motion-timeline-scroll").forEach((node) => node.remove());
});

function fixture() {
  const d = audioFixture(),
    base = overlayFixture();
  base.model({
    ...base.props.host.readModel(),
    rows: [],
    audioTracks: [d.track()],
    assets: { sound: d.asset },
  });
  const props: CanvasTimelineTargetProps = {
    ...base.props,
    engine: d.engine,
    compositionId: d.page().id,
    audioGestures: base.audioGestures,
    hit: {
      kind: "audio",
      trackId: d.track().id,
      rowKey: d.track().id,
      rowIndex: 2,
      bounds: { x: 0, y: 48, width: 200, height: 18 },
    },
  };
  return { d, base, props };
}

it("selects the nonvisual sound and sends exact move/trim ownership to the existing gesture port", () => {
  const { d, base, props } = fixture();
  const view = render(
    <TooltipProvider>
      <AudioCanvasTarget {...props} />
    </TooltipProvider>,
  );
  const clip = view.container.querySelector<HTMLElement>(".motion-audio-track")!;
  expect(view.container.querySelector("[data-layer-id]")).toBeNull();
  fireEvent.pointerDown(clip, { button: 0, pointerId: 2, clientX: 50 });
  expect(props.host.selectAudio).toHaveBeenCalledWith(d.track().id);
  expect(base.audioGestures.begin).toHaveBeenLastCalledWith(
    expect.anything(),
    d.track(),
    d.asset,
    "move",
    100,
  );
  const handles = view.container.querySelectorAll<HTMLElement>(".motion-trim-handle");
  expect(handles).toHaveLength(2);
  fireEvent.pointerDown(handles[0]!, { button: 0, pointerId: 3 });
  expect(base.audioGestures.begin).toHaveBeenLastCalledWith(
    expect.anything(),
    d.track(),
    d.asset,
    "start",
    100,
  );
  fireEvent.pointerDown(handles[1]!, { button: 0, pointerId: 4 });
  expect(base.audioGestures.begin).toHaveBeenLastCalledWith(
    expect.anything(),
    d.track(),
    d.asset,
    "end",
    100,
  );
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  view.unmount();
});

it("keeps text-edit deletion native and removes the sound with one undo outside editable controls", () => {
  const { d, props } = fixture();
  const view = render(
    <TooltipProvider>
      <AudioCanvasTarget {...props} />
    </TooltipProvider>,
  );
  const row = view.container.querySelector<HTMLElement>(".motion-audio-row")!;
  const input = document.createElement("input");
  row.append(input);
  fireEvent.keyDown(input, { key: "Delete" });
  expect(d.page().motion?.audioTracks).toHaveLength(1);
  fireEvent.keyDown(row, { key: "Delete" });
  expect(d.page().motion?.audioTracks).toHaveLength(0);
  expect(d.engine.getSnapshot().canUndo).toBe(true);
  act(() => d.engine.undo());
  expect(d.page().motion?.audioTracks).toHaveLength(1);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  view.unmount();
});

it("rejects old same-ID callbacks after replacing the project and accepts only the fresh scope", () => {
  const { d, base, props } = fixture();
  const view = render(
    <TooltipProvider>
      <AudioCanvasTarget {...props} />
    </TooltipProvider>,
  );
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  const clip = view.container.querySelector<HTMLElement>(".motion-audio-track")!;
  fireEvent.pointerDown(clip, { button: 0, pointerId: 1 });
  fireEvent.keyDown(view.container.querySelector(".motion-audio-row")!, { key: "Delete" });
  expect(base.audioGestures.begin).not.toHaveBeenCalled();
  expect(props.host.selectAudio).not.toHaveBeenCalled();
  expect(d.page().motion?.audioTracks).toHaveLength(1);
  view.rerender(
    <TooltipProvider>
      <AudioCanvasTarget {...props} />
    </TooltipProvider>,
  );
  fireEvent.click(view.container.querySelector(".motion-audio-track")!);
  expect(props.host.selectAudio).toHaveBeenCalledOnce();
  view.unmount();
});
