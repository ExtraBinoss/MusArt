import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
import { EasingPopover } from "../../../../src/components/motion/easing/EasingPopover";
import { i18n } from "../../../../src/state/i18n";

const metrics = vi.hoisted(() => ({ selectRenders: vi.fn() }));
vi.mock("../../../../src/components/shared/SelectField", async (load) => {
  const actual = await load<typeof import("../../../../src/components/shared/SelectField")>();
  return {
    ...actual,
    SelectField(props: Parameters<typeof actual.SelectField>[0]) {
      metrics.selectRenders();
      return <actual.SelectField {...props} />;
    },
  };
});

function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const target = { kind: "layer", layerId: d.rectangle.id, property: "x" } as const;
  d.engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: 0 },
    { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: 100 },
  ]);
  const page = d.engine.getSnapshot().project.pages[0]!,
    property = page.motion!.tracks.find((item) => item.layerId === d.rectangle.id)!.properties[0]!,
    destination = property.keyframes[1]!;
  d.mount(
    <EasingPopover
      engine={d.engine}
      compositionId={page.id}
      property={property}
      destination={destination}
    >
      <button type="button">Courbe</button>
    </EasingPopover>,
  );
  const current = () =>
    d.engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks.find((item) => item.layerId === d.rectangle.id)!
      .properties[0]!.keyframes[1]!;
  return { ...d, destination, current };
}

it("previews presets, cancels without history and saves one incoming-key change on Apply", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  await choose("Courbe d’interpolation", "Rebondissant");
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  fireEvent.click(screen.getByRole("button", { name: "Appliquer l’interpolation" }));
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  await choose("Courbe d’interpolation", "Décélération");
  fireEvent.click(screen.getByRole("button", { name: "Appliquer l’interpolation" }));
  expect(d.current()).toMatchObject({
    id: d.destination.id,
    time: d.destination.time,
    value: 100,
    easing: { type: "cubicBezier", x1: 0, x2: 0.58 },
  });
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before.project);
});

it("validates custom Bézier/spring controls and refuses stale commits", async () => {
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  await choose("Courbe d’interpolation", "Bézier personnalisée");
  fireEvent.change(screen.getByRole("spinbutton", { name: "X1" }), { target: { value: "2" } });
  expect(screen.getByRole("button", { name: "Appliquer l’interpolation" })).toBeDisabled();
  fireEvent.change(screen.getByRole("spinbutton", { name: "X1" }), { target: { value: "0.2" } });
  expect(screen.getByRole("button", { name: "Appliquer l’interpolation" })).toBeEnabled();
  await choose("Courbe d’interpolation", "Ressort personnalisé");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Rebond" }), {
    target: { value: "0.65" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Réponse" }), {
    target: { value: "16" },
  });
  const before = d.engine.getSnapshot();
  act(() => d.engine.execute({ type: "renameProject", name: "changed" }));
  expect(screen.getByRole("button", { name: "Appliquer l’interpolation" })).toBeDisabled();
  expect(
    screen.getByText("Cette image clé a changé. Fermez l’éditeur et réessayez."),
  ).toBeVisible();
  expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
  expect(d.current().easing).toBeUndefined();
});

it("previews hovered presets without selecting them or changing history, then restores the selected curve", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  const original = document.querySelector(".motion-easing-curve")!.getAttribute("d");
  const select = screen.getByRole("combobox", { name: "Courbe d’interpolation" });
  fireEvent.pointerDown(select, { button: 0, ctrlKey: false, pointerType: "mouse" });
  const item = await screen.findByRole("option", { name: "Accélération" });
  const beforeHover = metrics.selectRenders.mock.calls.length;
  fireEvent.pointerMove(item, { pointerType: "mouse" });
  expect(document.querySelector(".motion-easing-curve")!.getAttribute("d")).not.toBe(original);
  expect(select).toHaveTextContent("Linéaire");
  expect(d.engine.getSnapshot()).toBe(before);
  expect(metrics.selectRenders).toHaveBeenCalledTimes(beforeHover);
  const focus = screen.getByRole("option", { name: "Décélération" });
  fireEvent.focus(focus);
  expect(metrics.selectRenders).toHaveBeenCalledTimes(beforeHover);
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.keyDown(focus, { key: "Escape" });
  expect(document.querySelector(".motion-easing-curve")!.getAttribute("d")).toBe(original);
  expect(screen.getByRole("dialog", { name: "Interpolation" })).toBeVisible();
  expect(metrics.selectRenders).toHaveBeenCalledTimes(beforeHover);
});

it("does not build translated preset/field content for closed timeline connectors", () => {
  const translate = vi.spyOn(i18n, "t");
  fixture();
  expect(
    translate.mock.calls.some(
      ([key]) => key === "preset" || key === "customBezier" || key === "apply",
    ),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  expect(translate.mock.calls.some(([key]) => key === "preset")).toBe(true);
  expect(screen.getByRole("dialog", { name: "Interpolation" })).toBeVisible();
});

it("clears the graph on a stale origin and ignores detached preset hover callbacks", async () => {
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Courbe" }));
  const base = document.querySelector(".motion-easing-curve")!.getAttribute("d");
  fireEvent.pointerDown(screen.getByRole("combobox", { name: "Courbe d’interpolation" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  const option = await screen.findByRole("option", { name: "Accélération" });
  fireEvent.pointerMove(option, { pointerType: "mouse" });
  expect(document.querySelector(".motion-easing-curve")!.getAttribute("d")).not.toBe(base);
  act(() => d.engine.execute({ type: "renameProject", name: "stale preview" }));
  const afterChange = d.engine.getSnapshot();
  expect(document.querySelector(".motion-easing-curve")!.getAttribute("d")).toBe(base);
  expect(screen.getByRole("button", { name: "Appliquer l’interpolation" })).toBeDisabled();
  fireEvent.pointerMove(option, { pointerType: "mouse" });
  expect(document.querySelector(".motion-easing-curve")!.getAttribute("d")).toBe(base);
  expect(d.engine.getSnapshot()).toBe(afterChange);
});
