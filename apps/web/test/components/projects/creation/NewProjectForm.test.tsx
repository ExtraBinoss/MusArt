import { expect, test, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { NewProjectForm } from "../../../../src/components/projects/creation/NewProjectForm";
import { setup } from "../../../support/ui";

test("creates a visual preset without a background picker or all-formats selector", () => {
  const d = setup(),
    create = vi.fn();
  d.mount(<NewProjectForm onCreate={create} />);
  expect(screen.getByLabelText("Nom")).toHaveFocus();
  expect(screen.queryByLabelText("Fond")).toBeNull();
  expect(screen.queryByText("Tous les formats")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choisir un format" }));
  fireEvent.click(screen.getByRole("button", { name: /Publication Instagram/ }));
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      presetId: "instagram-post",
      width: 1080,
      height: 1080,
      background: "#faf9f6",
    }),
  );
});

test("links dimensions using the selected ratio and updates the preview live", () => {
  const d = setup(),
    create = vi.fn();
  d.mount(<NewProjectForm onCreate={create} />);
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "1200" } });
  fireEvent.change(screen.getByLabelText("Hauteur"), { target: { value: "800" } });
  fireEvent.click(screen.getByRole("button", { name: "Lier les proportions" }));
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "600" } });
  expect(screen.getByLabelText("Hauteur")).toHaveValue(400);
  expect(
    within(screen.getByRole("img", { name: "Aperçu du format" })).getByText("600 × 400 px"),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("Hauteur"), { target: { value: "200" } });
  expect(screen.getByLabelText("Largeur")).toHaveValue(300);
  fireEvent.click(screen.getByRole("button", { name: "Délier les proportions" }));
  fireEvent.change(screen.getByLabelText("Hauteur"), { target: { value: "900" } });
  expect(screen.getByLabelText("Largeur")).toHaveValue(300);
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "  Collection  " } });
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
  expect(create).toHaveBeenCalledExactlyOnceWith({
    name: "Collection",
    width: 300,
    height: 900,
    background: "#faf9f6",
  });
});

test("invalid dimensions, blank names and disabled submissions cannot create documents", () => {
  const d = setup(),
    create = vi.fn();
  const view = d.mount(<NewProjectForm onCreate={create} />);
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "0" } });
  fireEvent.submit(document.querySelector("form")!);
  expect(create).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "16385" } });
  expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "  " } });
  fireEvent.submit(document.querySelector("form")!);
  expect(create).not.toHaveBeenCalled();
  view.rerender(<NewProjectForm disabled onCreate={create} />);
  expect(screen.getByLabelText("Hauteur")).toBeDisabled();
});

test("linked dimensions cannot silently create the old size when the paired dimension exceeds limits", () => {
  const d = setup(),
    create = vi.fn();
  d.mount(<NewProjectForm onCreate={create} />);
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Hauteur"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Lier les proportions" }));
  fireEvent.change(screen.getByLabelText("Hauteur"), { target: { value: "100" } });
  expect(screen.getByLabelText("Hauteur")).toHaveValue(100);
  expect(screen.getByLabelText("Largeur")).toHaveValue(100000);
  expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
  fireEvent.submit(document.querySelector("form")!);
  expect(create).not.toHaveBeenCalled();
});
