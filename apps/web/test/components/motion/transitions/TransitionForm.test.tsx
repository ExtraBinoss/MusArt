import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  TransitionForm,
  type TransitionFormModel,
  type TransitionFormActions,
} from "../../../../src/components/motion/transitions/TransitionForm";
import { captureTransitionOrigin } from "../../../../src/components/motion/transitions/authoring";
import { createTransitionPreviewSource } from "../../../../src/components/motion/transitions/preview-source";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";

vi.mock("../../../../src/components/motion/transitions/TransitionPreview", () => ({
  TransitionPreview: ({ style }: { style: string }) => (
    <div data-testid="transition-preview" data-style={style} />
  ),
}));

function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const model: TransitionFormModel = {
    active: true,
    origin: captureTransitionOrigin(d.engine, d.page.id, d.rectangle.id),
    category: "fade",
    style: "fade",
    placement: "in",
    duration: "500",
    error: "",
    previewSource: createTransitionPreviewSource(),
  };
  const actions = {
    setPlacement: vi.fn(),
    selectCategory: vi.fn(),
    selectStyle: vi.fn(),
    setDuration: vi.fn(),
    preview: vi.fn(),
    clearPreview: vi.fn(),
    cancel: vi.fn(),
    apply: vi.fn(),
  } satisfies TransitionFormActions;
  const view = d.mount(<TransitionForm engine={d.engine} model={model} actions={actions} />);
  return { ...d, model, actions, view };
}

it("renders the authored model and forwards category, style, placement and duration actions", async () => {
  const d = fixture();
  expect(screen.getByRole("spinbutton", { name: "Durée" })).toHaveValue(500);
  expect(screen.getByRole("spinbutton", { name: "Durée" })).toHaveAttribute("max", "2000");
  expect(screen.getByTestId("transition-preview")).toHaveAttribute("data-style", "fade");
  fireEvent.click(screen.getByRole("radio", { name: "Sortie" }));
  expect(d.actions.setPlacement).toHaveBeenCalledExactlyOnceWith("out");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Durée" }), { target: { value: "250" } });
  expect(d.actions.setDuration).toHaveBeenCalledExactlyOnceWith("250");
  await choose("Catégorie de transition", "Révélations");
  expect(d.actions.selectCategory).toHaveBeenCalledExactlyOnceWith("reveal", "wipe");
  d.view.rerender(
    <TransitionForm
      engine={d.engine}
      model={{ ...d.model, category: "reveal", style: "wipe" }}
      actions={d.actions}
    />,
  );
  await choose("Style de transition", "Iris");
  expect(d.actions.selectStyle).toHaveBeenCalledExactlyOnceWith("iris");
});

it("retains form controls during exit, retires GPU preview, and forwards footer actions", () => {
  const d = fixture();
  const duration = screen.getByRole("spinbutton", { name: "Durée" });
  d.view.rerender(
    <TransitionForm
      engine={d.engine}
      model={{ ...d.model, active: false, origin: null, error: "invalid" }}
      actions={d.actions}
    />,
  );
  expect(screen.queryByTestId("transition-preview")).toBeNull();
  expect(screen.getByRole("spinbutton", { name: "Durée" })).toBe(duration);
  expect(duration).not.toHaveAttribute("max");
  expect(screen.getByRole("alert")).toHaveTextContent("tient dans ce clip");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(d.actions.cancel).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une transition" }));
  expect(d.actions.apply).toHaveBeenCalledOnce();
});
