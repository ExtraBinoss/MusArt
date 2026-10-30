import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TransitionPopover } from "../../../../src/components/motion/transitions/TransitionPopover";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";

// GPU correctness and lifecycle are exercised in the native browser suite.
vi.mock("../../../../src/components/motion/animations/PresetPreview", () => ({
  PresetPreview: () => null,
}));
function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const transport = makeTransport(page).transport;
  d.mount(
    <TransitionPopover
      engine={d.engine}
      compositionId={page.id}
      layerId={d.rectangle.id}
      transport={transport}
    />,
  );
  return { ...d, page };
}

it("browses a two-column motion library without editing the document, then applies one undoable action", async () => {
  const d = fixture(),
    user = userEvent.setup();
  const before = d.engine.getSnapshot().project;
  await user.click(screen.getByRole("button", { name: "Ajouter une animation" }));
  const dialog = screen.getByRole("dialog", { name: "Ajouter une animation" });
  expect(dialog.querySelector(".animation-preset-grid")).toHaveAttribute(
    "data-total-presets",
    "61",
  );
  expect(dialog.querySelectorAll(".animation-preset-card").length).toBeLessThan(25);
  fireEvent.click(screen.getByRole("button", { name: "Déplacement" }));
  expect(dialog.querySelectorAll(".animation-preset-card")).toHaveLength(8);
  await user.hover(screen.getByRole("button", { name: "Move · Left" }));
  expect(d.engine.getSnapshot().project).toBe(before);
  await user.click(screen.getByRole("button", { name: "Move · Left" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const animation = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations![0]!;
  expect(animation.preset.id).toBe("move-left");
  expect(animation.preset.channels[0]!.operation).toBe("add");
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});

it("searches and rejects a stale project without applying a selected preset", async () => {
  const d = fixture(),
    user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Ajouter une animation" }));
  fireEvent.change(screen.getByLabelText("Rechercher une animation…"), {
    target: { value: "Scale & focus" },
  });
  expect(document.querySelectorAll(".animation-preset-card")).toHaveLength(1);
  act(() => d.engine.execute({ type: "renameProject", name: "Changed while browsing" }));
  await user.click(screen.getByRole("button", { name: "Scale & focus" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Le projet a changé");
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations).toBeUndefined();
});

it("fits a preset to the visible positive range of a pre-roll occurrence", async () => {
  const d = fixture(),
    user = userEvent.setup();
  const track = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  act(() =>
    d.engine.execute({
      type: "setMotionTrackRange",
      trackId: track.id,
      start: { value: -150, rate: 1000 },
      end: { value: 300, rate: 1000 },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Ajouter une animation" }));
  await user.click(screen.getByRole("button", { name: "Flou" }));
  await user.click(screen.getByRole("button", { name: "Focus" }));
  const animation = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations![0]!;
  expect(animation.start.value).toBe(0);
  expect(animation.duration).toEqual({ value: 300, rate: 1000 });
  expect(screen.queryByRole("alert")).toBeNull();
});
