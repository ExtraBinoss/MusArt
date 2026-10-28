import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, within } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { PreferencesDialog } from "../../../../src/components/projects/preferences/PreferencesDialog";
import { keybindings } from "../../../../src/state/keybindings/store";
test("preferences are a standalone accessible dialog with native dismissal", () => {
  const d = setup(),
    close = vi.fn();
  d.mount(<PreferencesDialog onClose={close} />);
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Préférences");
  expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
    "Personnalisez l’apparence et la langue de l’éditeur.",
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalled();
});

test("the shortcuts category embeds the real editor and keeps shortcut capture Escape inside preferences", () => {
  const d = setup(),
    close = vi.fn();
  d.mount(<PreferencesDialog onClose={close} />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Raccourcis" }), {
    button: 0,
    ctrlKey: false,
  });
  const editor = screen.getByRole("dialog", { name: "Préférences" });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Enregistrer" } });
  const capture = screen.getByRole("button", { name: "Modifier le raccourci de Enregistrer" });
  fireEvent.click(capture);
  fireEvent.keyDown(capture, { key: "Escape" });
  expect(capture).not.toHaveAttribute("data-recording", "true");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(capture);
  fireEvent.keyDown(capture, { key: "p", ctrlKey: true, altKey: true });
  expect(keybindings.readSnapshot().overrides["action:save"]).toEqual([
    { key: "p", mod: true, alt: true, shift: false },
  ]);
  fireEvent.click(within(editor).getByRole("button", { name: "Fermer" }));
  expect(close).toHaveBeenCalledOnce();
  act(() => keybindings.reset());
});
test("opens directly in editor preferences through the routed initial section", () => {
  const d = setup();
  d.mount(<PreferencesDialog initialSection="editor" onClose={() => undefined} />);
  expect(screen.getByRole("tab", { name: "Éditeur" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("switch", { name: "Accrocher aux éléments" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Essayer le magnétisme" }));
  expect(screen.getByTestId("snapping-playground")).toBeVisible();
  expect(screen.getByRole("button", { name: "Objet à déplacer" })).toBeVisible();
});
