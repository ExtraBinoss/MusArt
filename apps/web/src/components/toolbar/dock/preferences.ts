import { atom } from "jotai";
import { SEARCH_COMMAND_IDS } from "../../search/catalog/items";

export const DOCK_STORAGE_KEY = "musart.dock.commands";
export const MAX_DOCK_COMMANDS = 12;
export const DEFAULT_DOCK_COMMANDS: string[] = [];
const allowed = new Set(SEARCH_COMMAND_IDS);

/** Preferences never contain document IDs or executable handlers. */
export function sanitizeDockCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_DOCK_COMMANDS];
  return [
    ...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id))),
  ].slice(0, MAX_DOCK_COMMANDS);
}
export function readDockCommands(): string[] {
  try {
    const serialized = localStorage.getItem(DOCK_STORAGE_KEY);
    return serialized && serialized.length <= 4096
      ? sanitizeDockCommands(JSON.parse(serialized))
      : [...DEFAULT_DOCK_COMMANDS];
  } catch {
    return [...DEFAULT_DOCK_COMMANDS];
  }
}
export function moveDockCommand(ids: readonly string[], id: string, index: number): string[] {
  const result = ids.filter((value) => value !== id);
  if (!ids.includes(id) || !Number.isInteger(index)) return [...ids];
  result.splice(Math.max(0, Math.min(result.length, index)), 0, id);
  return result;
}
const valueAtom = atom<string[]>(DEFAULT_DOCK_COMMANDS);
const initializedAtom = atom(false);
export const dockCommandsAtom = atom(
  (get) => get(valueAtom),
  (_get, set, value: unknown) => {
    const ids = sanitizeDockCommands(value);
    set(valueAtom, ids);
    try {
      localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Browser storage can be disabled; the current session remains usable.
    }
  },
);
export const initializeDockAtom = atom(null, (get, set) => {
  if (get(initializedAtom)) return;
  set(initializedAtom, true);
  set(valueAtom, readDockCommands());
});
