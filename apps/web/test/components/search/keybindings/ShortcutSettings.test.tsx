import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ShortcutSettings } from "../../../../src/components/search/keybindings/ShortcutSettings";
import { keybindings } from "../../../../src/state/keybindings/store";
import { setup } from "../../../support/ui";
test("the reusable settings body edits actual bindings, searches commands and reports reset storage failures", () => {
  const d = setup();
  d.mount(<ShortcutSettings />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Enregistrer" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  const capture = screen.getByRole("button", { name: "Modifier le raccourci de Enregistrer" });
  fireEvent.click(capture);
  fireEvent.keyDown(capture, { key: "p", ctrlKey: true, altKey: true });
  expect(keybindings.readSnapshot().overrides["action:save"]).toBeDefined();
  const reset = vi.spyOn(keybindings, "reset").mockImplementationOnce(() => {
    throw Error("Storage full");
  });
  fireEvent.click(screen.getByRole("button", { name: "Tout réinitialiser" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Le raccourci n’a pas pu être enregistré.");
  reset.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Tout réinitialiser" }));
  expect(keybindings.readSnapshot().overrides).toEqual({});
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unknown-command-zz" } });
  expect(screen.getByText("Aucune commande ne correspond à votre recherche.")).toBeVisible();
  act(() => keybindings.reset());
});
