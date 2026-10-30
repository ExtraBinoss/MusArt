import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { AnimationContextMenu } from "../../../../src/components/motion/animations/AnimationContextMenu";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";

function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "move-left")!,
    start: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    animation = page.motion!.tracks[0]!.animations![0]!;
  d.mount(
    <AnimationContextMenu
      engine={d.engine}
      page={page}
      layerId={d.rectangle.id}
      trackId={track.id}
      animation={animation}
      transport={makeTransport(page).transport}
      disabled={false}
    >
      <button>Motion block</button>
    </AnimationContextMenu>,
  );
  return { ...d, animation };
}

it("separates destructive animation deletion, preserves the object and restores it with one undo", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  fireEvent.contextMenu(screen.getByRole("button", { name: "Motion block" }));
  const remove = await screen.findByRole("menuitem", { name: "Supprimer l’animation" });
  expect(remove).toHaveAttribute("data-variant", "destructive");
  expect(remove.previousElementSibling).toHaveAttribute("role", "separator");
  fireEvent.click(remove);
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers).toHaveLength(3);
  expect(page.motion!.tracks[0]!.animations ?? []).toHaveLength(0);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});

it("duplicates only the captured animation and rejects a stale menu", async () => {
  const d = fixture();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Motion block" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Dupliquer l’animation" }));
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.motion!.tracks[0]!.animations).toHaveLength(2);
  expect(page.motion!.tracks[0]!.animations![1]).toMatchObject({
    start: { value: 1, rate: 1 },
    preset: d.animation.preset,
    strength: d.animation.strength,
    enabled: d.animation.enabled,
  });
  fireEvent.contextMenu(screen.getByRole("button", { name: "Motion block" }));
  const remove = await screen.findByRole("menuitem", { name: "Supprimer l’animation" });
  act(() => d.engine.execute({ type: "renameProject", name: "Changed while open" }));
  const before = d.engine.getSnapshot();
  fireEvent.click(remove);
  expect(d.engine.getSnapshot()).toBe(before);
});
