import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { setup } from "../../../support/ui";
import { captureTransitionOrigin } from "../../../../src/components/motion/transitions/authoring";
import { TransitionOccurrenceChooser } from "../../../../src/components/motion/transitions/TransitionOccurrenceChooser";
test("asks for an explicit clip instead of choosing the first occurrence in a gap", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const id = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: id,
    start: { value: 3, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const choices = page
    .motion!.tracks.filter((track) => track.layerId === d.rectangle.id)
    .map((track) => captureTransitionOrigin(d.engine, page.id, d.rectangle.id, track.id)!);
  const choose = vi.fn(),
    close = vi.fn();
  const view = d.mount(
    <TransitionOccurrenceChooser
      request={{ id: 1, token: {}, origin: choices[0]!, choices, point: { x: 10, y: 20 } }}
      onChoose={choose}
      onClose={close}
    />,
  );
  expect(screen.getByRole("dialog", { name: "Choisir un clip" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clip 2 · 3.000–5.000 s" }));
  expect(choose).toHaveBeenCalledWith(choices[1]!.trackId);
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  view.unmount();
});
