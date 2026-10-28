import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { BindingRow } from "../../../../src/components/search/keybindings/BindingRow";
import { BINDING_COMMANDS } from "../../../../src/state/keybindings/registry";
import { keybindings } from "../../../../src/state/keybindings/store";
import { useKeybindings } from "../../../../src/state/keybindings/use-keybindings";
import { setup } from "../../../support/ui";
import "../../../../src/components/search/keybindings/messages";
afterEach(() => {
  act(() => keybindings.reset());
  localStorage.clear();
});
function Row() {
  const snapshot = useKeybindings();
  return (
    <BindingRow
      command={BINDING_COMMANDS.find((item) => item.id === "action:save")!}
      snapshot={snapshot}
    />
  );
}
test("records a real replacement, preserves Escape cancellation, exposes conflicts and supports clear/reset", () => {
  setup().mount(<Row />);
  const record = screen.getByRole("button", { name: "Modifier le raccourci de Enregistrer" });
  fireEvent.click(record);
  fireEvent.keyDown(record, { key: "Control", ctrlKey: true });
  fireEvent.keyDown(record, { key: "z", ctrlKey: true });
  expect(screen.getByRole("alert")).toHaveTextContent("Annuler");
  expect(keybindings.readSnapshot().overrides).toEqual({});
  fireEvent.keyDown(record, { key: "Escape" });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(record);
  fireEvent.keyDown(record, { key: "p", ctrlKey: true, altKey: true });
  expect(keybindings.readSnapshot().bindings.get("action:save")?.[0]).toMatchObject({
    key: "p",
    alt: true,
  });
  expect(record).toHaveTextContent("Alt");
  fireEvent.click(screen.getByRole("button", { name: "Retirer le raccourci de Enregistrer" }));
  expect(record).toHaveTextContent("Non assigné");
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser Enregistrer" }));
  expect(record).toHaveTextContent("S");
  fireEvent.click(record);
  fireEvent.blur(record);
  fireEvent.keyDown(record, { key: "q", ctrlKey: true });
  expect(keybindings.readSnapshot().overrides).toEqual({});
});
test("reports failed persistence and invalid capture without claiming the shortcut was saved", () => {
  setup().mount(<Row />);
  const record = screen.getByRole("button", { name: "Modifier le raccourci de Enregistrer" });
  fireEvent.click(record);
  fireEvent.keyDown(record, { key: "Unidentified" });
  expect(screen.getByRole("alert")).toHaveTextContent("Choisissez une touche");
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.keyDown(record, { key: "p", ctrlKey: true, altKey: true });
  expect(screen.getByRole("alert")).toHaveTextContent("enregistré");
  expect(keybindings.readSnapshot().overrides).toEqual({});
  set.mockRestore();
});
