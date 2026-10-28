import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { setup } from "../../support/ui";
import { ShortcutsDialog } from "../../../src/components/search/ShortcutsDialog";
import { keybindings } from "../../../src/state/keybindings/store";
test("shows genuine themed keycaps for tools, document and canvas shortcuts", () => {
  const d = setup(),
    onClose = vi.fn();
  d.mount(<ShortcutsDialog onClose={onClose} />);
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Raccourcis clavier");
  expect(screen.getByRole("region", { name: "Navigation du canvas" })).toBeInTheDocument();
  expect(screen.getByText("Zoomer autour du pointeur")).toBeInTheDocument();
  expect(document.querySelectorAll('[data-slot="kbd"]').length).toBeGreaterThan(25);
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(onClose).toHaveBeenCalledOnce();
});
test("filters actual commands and resets persisted overrides from the editable dialog", () => {
  const d = setup();
  act(() => keybindings.assign("action:save", [{ key: "p", mod: true, alt: true, shift: false }]));
  d.mount(<ShortcutsDialog onClose={() => undefined} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz-not-a-command" } });
  expect(screen.getByText("Aucune commande ne correspond à votre recherche.")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Enregistrer" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Tout réinitialiser" }));
  expect(keybindings.readSnapshot().overrides).toEqual({});
  localStorage.clear();
});
