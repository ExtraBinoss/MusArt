import { afterEach, expect, it, vi } from "vitest";
import { createStore } from "jotai";
import {
  ClipboardPreferenceStore,
  CLIPBOARD_STORAGE_KEY,
  clipboardPreferences,
  clipboardAtom,
} from "../../../src/state/clipboard/preferences";
afterEach(() => {
  clipboardPreferences.update(true);
  localStorage.clear();
});
it("validates versioned image preferences, persists changes and releases cross-window listeners", () => {
  const events = new EventTarget(),
    storage = { getItem: vi.fn((): string | null => null), setItem: vi.fn() };
  const store = new ClipboardPreferenceStore(() => storage, events),
    listener = vi.fn();
  expect(store.read()).toEqual({ includeImages: true });
  const stop = store.subscribe(listener);
  store.update(false);
  expect(storage.setItem).toHaveBeenCalledWith(
    CLIPBOARD_STORAGE_KEY,
    JSON.stringify({ version: 1, includeImages: false }),
  );
  store.update(false);
  expect(listener).toHaveBeenCalledOnce();
  storage.getItem.mockReturnValue(JSON.stringify({ version: 1, includeImages: true }));
  events.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
  expect(store.read().includeImages).toBe(false);
  events.dispatchEvent(new StorageEvent("storage", { key: CLIPBOARD_STORAGE_KEY }));
  expect(store.read().includeImages).toBe(true);
  storage.getItem.mockReturnValue(JSON.stringify({ version: 1, includeImages: false }));
  events.dispatchEvent(new StorageEvent("storage", { key: null }));
  expect(store.read().includeImages).toBe(false);
  stop();
  storage.getItem.mockReturnValue(null);
  events.dispatchEvent(new StorageEvent("storage", { key: CLIPBOARD_STORAGE_KEY }));
  expect(store.read().includeImages).toBe(false);
  expect(() => store.update("false" as unknown as boolean)).toThrow();
});
it("ignores malformed/oversized records and retains a volatile choice across remounts when storage fails", () => {
  const storage = { getItem: vi.fn((): string | null => "{"), setItem: vi.fn() };
  for (const raw of [
    "{",
    "[]",
    "null",
    "{}",
    '{"version":2,"includeImages":false}',
    '{"version":1,"includeImages":42}',
    " ".repeat(257),
  ]) {
    storage.getItem.mockReturnValue(raw);
    expect(new ClipboardPreferenceStore(() => storage).read()).toEqual({ includeImages: true });
  }
  const store = new ClipboardPreferenceStore(() => storage);
  storage.setItem.mockImplementation(() => {
    throw new Error("blocked");
  });
  store.update(false);
  const stop = store.subscribe(vi.fn());
  expect(store.read().includeImages).toBe(false);
  stop();
  storage.getItem.mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(new ClipboardPreferenceStore(() => storage).read().includeImages).toBe(true);
});
it("Jotai UI bindings share the same live preference without document state", () => {
  const store = createStore(),
    stop = store.sub(clipboardAtom, () => {});
  expect(store.get(clipboardAtom).includeImages).toBe(true);
  store.set(clipboardAtom, false);
  expect(store.get(clipboardAtom).includeImages).toBe(false);
  expect(clipboardPreferences.read().includeImages).toBe(false);
  stop();
});
