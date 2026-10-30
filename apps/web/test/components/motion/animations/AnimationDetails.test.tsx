import { useSyncExternalStore } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { expect, it } from "vitest";
import { AnimationDetails } from "../../../../src/components/motion/animations/AnimationDetails";
import { setup } from "../../../support/ui";

function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((p) => p.id === "scale-blur")!,
    start: { value: 0, rate: 1 },
  });
  function Details() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    const animation = snapshot.project.pages[0]!.motion!.tracks[0]!.animations![0]!;
    return <AnimationDetails engine={d.engine} animation={animation} run={d.run} />;
  }
  d.mount(<Details />);
  const animation = () =>
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations![0]!;
  return { ...d, animation };
}

it("explains scale on demand and commits percentages in the original unit with one undo entry", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  const channel = within(screen.getByRole("region", { name: "Échelle horizontale" }));
  expect(
    screen.queryByText("100 % = taille d’origine. Moins pour réduire, plus pour agrandir."),
  ).toBeNull();
  await userEvent
    .setup()
    .hover(channel.getByRole("button", { name: "À propos de Échelle horizontale" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "100 % = taille d’origine. Moins pour réduire, plus pour agrandir.",
  );
  expect(channel.getByText("Départ")).toBeVisible();
  expect(channel.getByText("Arrivée")).toBeVisible();
  const value = channel.getAllByRole("textbox", { name: "Valeur" })[0]!;
  expect(value).toHaveValue("5");
  fireEvent.change(value, { target: { value: "75" } });
  fireEvent.blur(value);
  expect(d.animation().preset.channels[0]!.points[0]!.value).toBe(0.75);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  act(() => d.engine.redo());
  expect(d.animation().preset.channels[0]!.points[0]!.value).toBe(0.75);
});

it("adds and removes a labeled intermediate step, preserving endpoints and sibling channels", async () => {
  const d = fixture(),
    siblings = d.animation().preset.channels.slice(1);
  const channel = within(screen.getByRole("region", { name: "Échelle horizontale" }));
  fireEvent.click(channel.getByRole("button", { name: "Ajouter un point" }));
  await waitFor(() => expect(channel.getByText("Étape 1")).toBeVisible());
  expect(
    channel
      .getAllByRole("textbox", { name: "À" })
      .map((input) => (input as HTMLInputElement).value),
  ).toEqual(["0", "50", "100"]);
  expect(d.animation().preset.channels[0]!.points[1]).toMatchObject({ at: 0.5, value: 0.525 });
  expect(channel.getAllByLabelText("Temps de départ ou d’arrivée fixe")).toHaveLength(2);
  await userEvent.setup().hover(channel.getAllByLabelText("Temps de départ ou d’arrivée fixe")[0]!);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Le départ reste à 0 % et l’arrivée à 100 %.",
  );
  fireEvent.click(channel.getByRole("button", { name: "Retirer l’étape 1" }));
  expect(d.animation().preset.channels[0]!.points).toHaveLength(2);
  expect(d.animation().preset.channels.slice(1)).toEqual(siblings);
  act(() => d.engine.undo());
  expect(d.animation().preset.channels[0]!.points).toHaveLength(3);
});

it("removes a whole property and protects the final channel without orphaning the animation", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  fireEvent.click(
    screen.getByRole("button", { name: "Retirer l’animation de Échelle horizontale" }),
  );
  expect(d.animation().preset.channels.map((c) => c.target.property)).toEqual(["scaleY", "amount"]);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  act(() => d.engine.redo());
  fireEvent.click(screen.getByRole("button", { name: "Retirer l’animation de Échelle verticale" }));
  expect(d.animation().preset.channels).toHaveLength(1);
  const remove = screen.getByRole("button", { name: /Retirer l’animation de/ });
  expect(remove).toBeDisabled();
  fireEvent.click(remove);
  expect(d.animation().preset.channels).toHaveLength(1);
});
