import { expect, test, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { createSearchCommandItems } from "../../../../src/components/search/catalog/items";
import { PinnedCommands } from "../../../../src/components/toolbar/dock/PinnedCommands";
import { DOCK_STORAGE_KEY } from "../../../../src/components/toolbar/dock/preferences";
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
    Array.from(group.querySelectorAll("[data-dock-command]")).map((item) =>
      item.getAttribute("data-dock-command"),
    );
  return { ...d, run, group, row, transfer, order };
}
test("executes shared commands with disabled gates and persists only completed drags", () => {
  const d = fixture();
  fireEvent.click(within(d.group).getByLabelText("save"));
  expect(d.run).toHaveBeenCalledExactlyOnceWith("action:save");
  expect(within(d.group).getByLabelText("delete")).toBeDisabled();
  const original = localStorage.getItem(DOCK_STORAGE_KEY);
  fireEvent.dragStart(d.row("addPage"), { dataTransfer: d.transfer });
  fireEvent.dragOver(d.row("save"), { dataTransfer: d.transfer });
  expect(d.order().slice(0, 2)).toEqual(["action:save", "action:addPage"]);
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
