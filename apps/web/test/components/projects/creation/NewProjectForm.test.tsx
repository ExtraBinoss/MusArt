import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { NewProjectForm } from "../../../../src/components/projects/creation/NewProjectForm";
import { choose } from "../../../support/select";
import { setup } from "../../../support/ui";
test("creates presets and custom documents with committed dimensions", async () => {
  const d = setup(),
    create = vi.fn();
  d.mount(<NewProjectForm onCreate={create} />);
  await choose("Catégorie du format", "Réseaux sociaux");
  await choose("Format", "Publication Instagram · 1080 × 1080");
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ presetId: "instagram-post", width: 1080, height: 1080 }),
  );
  await choose("Format", "Personnalisé");
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Collection" } });
  for (const [label, value] of [
    ["Largeur", "1200"],
    ["Hauteur", "800"],
  ]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    fireEvent.blur(screen.getByLabelText(label!));
  }
  fireEvent.change(screen.getByLabelText("Fond"), { target: { value: "#000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
  expect(create).toHaveBeenLastCalledWith({
    name: "Collection",
    width: 1200,
    height: 800,
    background: "#000000",
  });
});
