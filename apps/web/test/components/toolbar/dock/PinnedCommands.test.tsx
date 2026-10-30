import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { createSearchCommandItems } from "../../../../src/components/search/catalog/items";
import { PinnedCommands } from "../../../../src/components/toolbar/dock/PinnedCommands";
import {
  DOCK_STORAGE_KEY,
  dockCommandsAtom,
} from "../../../../src/components/toolbar/dock/preferences";
function fixture() {
  localStorage.setItem(
    DOCK_STORAGE_KEY,
    JSON.stringify(["action:addPage", "action:save", "action:delete"]),
  );
  const d = setup(),
    run = vi.fn();
  d.mount(
    <PinnedCommands
      commands={createSearchCommandItems(d.engine.getSnapshot(), (key) => key)}
      run={run}
    />,
  );
  const group = screen.getByRole("group", { name: "Raccourcis épinglés" });
  const row = (id: string) => group.querySelector(`[data-dock-command="action:${id}"]`)!;
  const data = new Map<string, string>();
  const transfer = {
    setData: (key: string, value: string) => data.set(key, value),
    getData: (key: string) => data.get(key),
    effectAllowed: "",
    dropEffect: "",
  };
  const order = () =>
    Array.from(group.querySelectorAll<HTMLElement>("[data-dock-command]"))
      .sort((a, b) => Number(a.style.order) - Number(b.style.order))
      .map((item) => item.getAttribute("data-dock-command"));
  return { ...d, run, group, row, transfer, order };
}
test("executes shared commands with disabled gates and persists only completed drags", () => {
  const d = fixture();
  fireEvent.click(within(d.group).getByLabelText("save"));
  expect(d.run).toHaveBeenCalledExactlyOnceWith("action:save");
  expect(within(d.group).getByLabelText("delete")).toBeDisabled();
  const original = localStorage.getItem(DOCK_STORAGE_KEY);
  const source = d.row("addPage"),
    insert = vi.spyOn(d.group, "insertBefore"),
    append = vi.spyOn(d.group, "appendChild");
  fireEvent.dragStart(d.row("addPage"), { dataTransfer: d.transfer });
  fireEvent.dragOver(d.row("save"), { dataTransfer: d.transfer });
  expect(d.order().slice(0, 2)).toEqual(["action:addPage", "action:save"]);
  expect(d.row("addPage")).toBe(source);
  expect(insert).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
  expect(localStorage.getItem(DOCK_STORAGE_KEY)).toBe(original);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(d.order().slice(0, 2)).toEqual(["action:addPage", "action:save"]);
  fireEvent.drop(d.row("save"), { dataTransfer: d.transfer });
  expect(localStorage.getItem(DOCK_STORAGE_KEY)).toBe(original);
  fireEvent.dragStart(d.row("addPage"), { dataTransfer: d.transfer });
  fireEvent.dragOver(d.row("save"), { dataTransfer: d.transfer });
  fireEvent.drop(d.row("save"), { dataTransfer: d.transfer });
  expect(JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY)!)).toEqual([
    "action:save",
    "action:addPage",
    "action:delete",
  ]);
  expect(screen.getByRole("status")).toHaveTextContent("Ordre des raccourcis modifié");
  fireEvent.dragEnd(d.row("save"));
  fireEvent.keyDown(window, { key: "q" });
  localStorage.removeItem(DOCK_STORAGE_KEY);
});
test("foreign drops are inert and customization can remove a pinned command", () => {
  const d = fixture();
  fireEvent.dragOver(d.row("save"), { dataTransfer: d.transfer });
  fireEvent.drop(d.row("save"), { dataTransfer: d.transfer });
  expect(d.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Personnaliser le dock"));
  const groups = screen.getAllByRole("group", { name: "Raccourcis épinglés" });
  fireEvent.click(within(groups[1]!).getByLabelText("Désépingler save"));
  expect(d.order()).toEqual(["action:addPage", "action:delete"]);
  localStorage.removeItem(DOCK_STORAGE_KEY);
});
test("right-click unpins directly, persists the latest order and never executes a document command", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  fireEvent.contextMenu(d.row("save"), { clientX: 24, clientY: 120 });
  expect(screen.getByRole("menuitem", { name: "Désépingler save" })).toBeVisible();
  expect(screen.queryByText("Commandes disponibles")).toBeNull();
  act(() => {
    d.store.set(dockCommandsAtom, [
      "action:addPage",
      "action:save",
      "action:delete",
      "action:recenter",
    ]);
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Désépingler save" }));
  expect(d.store.get(dockCommandsAtom)).toEqual([
    "action:addPage",
    "action:delete",
    "action:recenter",
  ]);
  expect(JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY)!)).toEqual(
    d.store.get(dockCommandsAtom),
  );
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(screen.getByRole("status")).toHaveTextContent("save désépinglé");
  await waitFor(() => expect(d.row("delete")).toHaveFocus());
});
test("disabled shortcuts remain removable with the Menu key and Shift+F10; Escape preserves pins", async () => {
  const d = fixture(),
    original = d.store.get(dockCommandsAtom),
    disabled = d.row("delete");
  expect(disabled).toHaveAttribute("tabindex", "0");
  (disabled as HTMLElement).focus();
  fireEvent.keyDown(disabled, { key: "q" });
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.keyDown(disabled, { key: "ContextMenu" });
  expect(screen.getByRole("menuitem", { name: "Désépingler delete" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(d.store.get(dockCommandsAtom)).toBe(original);
  fireEvent.keyDown(disabled, { key: "F10", shiftKey: true });
  fireEvent.click(screen.getByRole("menuitem", { name: "Désépingler delete" }));
  expect(d.order()).toEqual(["action:addPage", "action:save"]);
  expect(d.run).not.toHaveBeenCalled();
  await waitFor(() => expect(within(d.group).getByRole("button", { name: "save" })).toHaveFocus());
});
test("opening the menu cancels a held reorder and removing the final pin keeps a focus target", async () => {
  const d = fixture();
  fireEvent.dragStart(d.row("addPage"), { dataTransfer: d.transfer });
  fireEvent.dragOver(d.row("save"), { dataTransfer: d.transfer });
  expect(d.order().slice(0, 2)).toEqual(["action:addPage", "action:save"]);
  fireEvent.contextMenu(d.row("save"));
  expect(d.order().slice(0, 2)).toEqual(["action:addPage", "action:save"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Désépingler save" }));
  act(() => d.store.set(dockCommandsAtom, ["action:addPage"]));
  fireEvent.contextMenu(d.row("addPage"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Désépingler addPage" }));
  expect(d.order()).toEqual([]);
  expect(localStorage.getItem(DOCK_STORAGE_KEY)).toBe("[]");
  await waitFor(() => expect(d.group).toHaveFocus());
});
