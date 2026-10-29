import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ProjectCreateActions } from "../../../../src/components/projects/dashboard/ProjectCreateActions";
import { setup } from "../../../support/ui";

test("keeps creating separate from the portable import menu", async () => {
  const d = setup(),
    create = vi.fn(),
    importProject = vi.fn();
  d.mount(
    <ProjectCreateActions
      label="Canvas personnalisé"
      disabled={false}
      onCreate={create}
      onImport={importProject}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Canvas personnalisé" }));
  expect(create).toHaveBeenCalledOnce();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Options de création" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Importer .musart" }));
  expect(importProject).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
});
test("pending work disables both halves of the split action", () => {
  const d = setup();
  d.mount(
    <ProjectCreateActions label="Nouveau projet" disabled onCreate={vi.fn()} onImport={vi.fn()} />,
  );
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
});
