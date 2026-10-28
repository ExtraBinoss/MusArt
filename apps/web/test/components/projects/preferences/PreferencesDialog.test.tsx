import { expect, test, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { PreferencesDialog } from "../../../../src/components/projects/preferences/PreferencesDialog";
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

test("the settings action opens the real shortcut editor and returns to preferences", async () => {
  const d = setup(),
    close = vi.fn();
  d.mount(<PreferencesDialog onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Personnaliser les raccourcis" }));
  const editor = await screen.findByRole("dialog", { name: "Raccourcis clavier" });
  expect(editor).toBeVisible();
  fireEvent.click(within(editor).getByRole("button", { name: "Fermer" }));
  expect(screen.getByRole("dialog", { name: "Préférences" })).toBeVisible();
  expect(close).not.toHaveBeenCalled();
});
