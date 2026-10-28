import { expect, test, vi } from "vitest";
import { KeybindingStore } from "../../../src/state/keybindings/store";
import { KEYBINDINGS_STORAGE_KEY } from "../../../src/state/keybindings/preferences";
const custom = { key: "p", mod: true, alt: true, shift: false };
function fixture() {
  const records = new Map<string, string>(),
    events = new EventTarget(),
    storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      },
      removeItem: (key: string) => {
        records.delete(key);
      },
    };
  return { records, events, storage, store: new KeybindingStore(() => storage, events) };
}
test("persists atomic overrides, resets independently/all, synchronizes another session and removes listeners", () => {
  const d = fixture(),
    listener = vi.fn(),
    remove = vi.spyOn(d.events, "removeEventListener"),
    stop = d.store.subscribe(listener);
  d.store.assign("action:save", [custom]);
  expect(listener).toHaveBeenCalledOnce();
  const reopened = new KeybindingStore(() => d.storage, d.events);
  expect(reopened.readSnapshot().bindings.get("action:save")).toEqual([custom]);
  const another = vi.fn(),
    unsubscribe = reopened.subscribe(another);
  d.store.assign("action:save", []);
  d.events.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
  expect(another).not.toHaveBeenCalled();
  d.events.dispatchEvent(new StorageEvent("storage", { key: KEYBINDINGS_STORAGE_KEY }));
  expect(reopened.readSnapshot().bindings.get("action:save")).toEqual([]);
  expect(another).toHaveBeenCalledOnce();
  d.store.reset("action:save");
  expect(d.store.readSnapshot().overrides).toEqual({});
  d.store.assign("action:save", [custom]);
  d.store.reset();
  d.records.clear();
  d.events.dispatchEvent(new StorageEvent("storage", { key: null }));
  stop();
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(2);
});
test("rejects blocked persistence and collisions without publishing false successful changes", () => {
  const d = fixture(),
    original = d.store.readSnapshot(),
    listener = vi.fn(),
    stop = d.store.subscribe(listener);
  vi.spyOn(d.storage, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => d.store.assign("action:save", [custom])).toThrow("storage");
  expect(d.store.readSnapshot()).toBe(original);
  expect(listener).not.toHaveBeenCalled();
  expect(() => d.store.assign("action:save", [{ ...custom, key: "z", alt: false }])).toThrow(
    "collision",
  );
  stop();
  const blocked = new KeybindingStore(() => {
    throw new Error("storage denied");
  }, d.events);
  expect(blocked.readSnapshot().overrides).toEqual({});
  expect(() => blocked.reset()).toThrow("storage");
});
test("merges committed preferences from another session before its storage event has arrived", () => {
  const d = fixture(),
    other = new KeybindingStore(() => d.storage, d.events);
  other.assign("action:save", [custom]);
  d.store.assign("action:undo", [{ ...custom, key: "j" }]);
  expect(d.store.readSnapshot().overrides).toMatchObject({
    "action:save": [custom],
    "action:undo": [{ ...custom, key: "j" }],
  });
});
