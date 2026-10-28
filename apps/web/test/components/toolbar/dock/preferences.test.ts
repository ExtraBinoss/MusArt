import { expect, test, vi } from "vitest";
import { createStore } from "jotai";
import { SEARCH_COMMAND_IDS } from "../../../../src/components/search/catalog/items";
import {
  DEFAULT_DOCK_COMMANDS,
  DOCK_STORAGE_KEY,
  MAX_DOCK_COMMANDS,
  dockCommandsAtom,
  initializeDockAtom,
  moveDockCommand,
  readDockCommands,
  sanitizeDockCommands,
} from "../../../../src/components/toolbar/dock/preferences";

test("accepts only bounded unique command IDs and never document IDs", () => {
  expect(DEFAULT_DOCK_COMMANDS).toEqual([]);
  expect(sanitizeDockCommands(null)).toEqual(DEFAULT_DOCK_COMMANDS);
  expect(
    sanitizeDockCommands([
      "layer:secret",
      {},
      42,
      "action:addPage",
      "action:addPage",
      "action:save",
    ]),
  ).toEqual(["action:addPage", "action:save"]);
  expect(sanitizeDockCommands(SEARCH_COMMAND_IDS)).toHaveLength(MAX_DOCK_COMMANDS);
  expect(sanitizeDockCommands([])).toEqual([]);
});
test("loads validated browser preferences once per store, writes only sanitized changes and survives unavailable storage", () => {
  localStorage.removeItem(DOCK_STORAGE_KEY);
  expect(readDockCommands()).toEqual(DEFAULT_DOCK_COMMANDS);
  localStorage.setItem(DOCK_STORAGE_KEY, "{");
  expect(readDockCommands()).toEqual(DEFAULT_DOCK_COMMANDS);
  localStorage.setItem(DOCK_STORAGE_KEY, "x".repeat(4097));
  expect(readDockCommands()).toEqual(DEFAULT_DOCK_COMMANDS);
  localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(["action:save", "foreign"]));
  const store = createStore();
  store.set(initializeDockAtom);
  expect(store.get(dockCommandsAtom)).toEqual(["action:save"]);
  localStorage.setItem(DOCK_STORAGE_KEY, "[]");
  store.set(initializeDockAtom);
  expect(store.get(dockCommandsAtom)).toEqual(["action:save"]);
  store.set(dockCommandsAtom, ["action:addPage", "unknown"]);
  expect(JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY)!)).toEqual(["action:addPage"]);
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("blocked");
  });
  expect(readDockCommands()).toEqual(DEFAULT_DOCK_COMMANDS);
  get.mockRestore();
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("full");
  });
  store.set(dockCommandsAtom, []);
  expect(store.get(dockCommandsAtom)).toEqual([]);
  set.mockRestore();
  localStorage.removeItem(DOCK_STORAGE_KEY);
});
test("moves commands immutably with bounded indices and rejects invalid drags", () => {
  const ids = ["a", "b", "c"];
  expect(moveDockCommand(ids, "a", 2)).toEqual(["b", "c", "a"]);
  expect(moveDockCommand(ids, "c", -100)).toEqual(["c", "a", "b"]);
  expect(moveDockCommand(ids, "a", 100)).toEqual(["b", "c", "a"]);
  expect(moveDockCommand(ids, "foreign", 0)).toEqual(ids);
  expect(moveDockCommand(ids, "a", NaN)).toEqual(ids);
  expect(ids).toEqual(["a", "b", "c"]);
});
