import { act, fireEvent, screen } from "@testing-library/react";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { expect, it } from "vitest";
import { AnimationActions } from "../../../../src/components/motion/animations/AnimationActions";
import { setup } from "../../../support/ui";
import "../../../../src/components/motion/animations/messages";

function fixture(disabled = false) {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((p) => p.id === "move-left")!,
    start: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    animation = page.motion!.tracks[0]!.animations![0]!;
  d.mount(
    <AnimationActions
      engine={d.engine}
      page={page}
      layerId={d.rectangle.id}
      trackId={track.id}
      animation={animation}
      run={d.run}
      disabled={disabled}
    />,
  );
  return { ...d, page, animation };
}

it("duplicates and deletes through undoable commands while preserving the layer", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  expect(screen.getAllByRole("button").at(-1)).toHaveAccessibleName(
    "Autres actions de l’animation",
  );
  fireEvent.click(screen.getByRole("button", { name: "Dupliquer l’animation" }));
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations![1]).toMatchObject({
    start: { value: 1, rate: 1 },
    preset: d.animation.preset,
  });
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "Supprimer l’animation" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations ?? []).toHaveLength(
    0,
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});

it("keeps locked animation mutations disabled", async () => {
  const d = fixture(true),
    before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Dupliquer l’animation" }));
  fireEvent.click(screen.getByRole("button", { name: "Supprimer l’animation" }));
  expect(d.engine.getSnapshot()).toBe(before);
});
