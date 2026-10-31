import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Profiler } from "react";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { LayerAnimations } from "../../../../src/components/motion/animations/LayerAnimations";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { setup } from "../../../support/ui";

it("layer selection leaves the unchanged animation controls and their computed model retained", () => {
  const d = setup(),
    commits = vi.fn();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.mount(
    <Profiler id="animations" onRender={commits}>
      <LayerAnimations engine={d.engine} layerId={d.text.id} />
    </Profiler>,
  );
  commits.mockClear();
  act(() => d.engine.select([d.rectangle.id]));
  act(() => d.engine.select([d.text.id]));
  expect(commits).not.toHaveBeenCalled();
  act(() => d.engine.execute({ type: "updatePage", patch: { name: "Updated" } }));
  expect(commits).toHaveBeenCalled();
});

it("retires a deleted animation owner before the deferred Inspector catches up, and undo restores it", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.mount(<LayerAnimations engine={d.engine} layerId={d.text.id} />);
  expect(screen.getByRole("region", { name: "Animations" })).toBeVisible();
  act(() => d.engine.execute({ type: "deleteLayers", ids: [d.text.id] }));
  expect(screen.queryByRole("region", { name: "Animations" })).toBeNull();
  act(() => d.engine.undo());
  expect(screen.getByRole("region", { name: "Animations" })).toBeVisible();
});

it("keeps typography edits on the text object, commits delay/intensity once, and duplicates live settings", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === d.text.id)!;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((p) => p.id === "type-inflate")!,
    start: { value: 0, rate: 1 },
  });
  const current = () => d.engine.getSnapshot().project.pages[0]!;
  animationPresentation(d.engine).set({
    selected: current().motion!.tracks.find((t) => t.id === track.id)!.animations![0]!.id,
  });
  d.mount(<LayerAnimations engine={d.engine} layerId={d.text.id} />);
  const before = d.engine.getSnapshot().revision;
  const stagger = screen.getByRole("textbox", { name: "Décalage" });
  fireEvent.change(stagger, { target: { value: "35" } });
  fireEvent.blur(stagger);
  expect(d.engine.getSnapshot().revision).toBe(before + 1);
  expect(
    current().layers.find((layer) => layer.id === d.text.id)!.effects[0]!.settings!.stagger,
  ).toBe(0.35);
  act(() => d.engine.undo());
  expect(
    current().layers.find((layer) => layer.id === d.text.id)!.effects[0]!.settings!.stagger,
  ).toBe(0.45);
  const intensity = screen.getByRole("textbox", { name: "Intensité" });
  expect(intensity).toHaveValue("65");
  fireEvent.change(intensity, { target: { value: "40" } });
  fireEvent.blur(intensity);
  expect(current().layers.find((layer) => layer.id === d.text.id)!.effects[0]!.amount).toBe(0.4);
  fireEvent.click(screen.getByRole("button", { name: "Dupliquer l’animation" }));
  const copy = current().motion!.tracks.find((t) => t.id === track.id)!.animations![1]!;
  expect(copy.preset.effects[0]!.amount).toBe(0.4);
  expect(current().layers).toHaveLength(3);
  expect(current().layers.find((layer) => layer.id === d.text.id)!.text).toBe("Bonjour");
});
