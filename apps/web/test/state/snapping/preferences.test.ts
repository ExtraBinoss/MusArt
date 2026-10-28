import { expect, test, vi } from "vitest";
import { createStore } from "jotai";
import {
  DEFAULT_SNAPPING,
  SNAPPING_STORAGE_KEY,
  SnappingPreferenceStore,
  snappingAtom,
  snappingPreferences,
  validateSnappingPreferences,
} from "../../../src/state/snapping/preferences";

function storage(initial?: string) {
  const values = new Map(initial ? [[SNAPPING_STORAGE_KEY, initial]] : []);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
test("validates and normalizes only finite supported user choices", () => {
  for (const invalid of [
    null,
    1,
    {},
    { enabled: 1, threshold: 6 },
    { enabled: true },
    { enabled: true, threshold: "6" },
    ...[NaN, Infinity, -1, 0, 25].map((threshold) => ({ enabled: true, threshold })),
  ])
    expect(() => validateSnappingPreferences(invalid)).toThrow(RangeError);
  for (const threshold of [1, 6, 9.5, 24]) {
    const result = validateSnappingPreferences({ enabled: false, threshold, ignored: "extra" });
    expect(result).toEqual({ enabled: false, threshold });
    expect(Object.isFrozen(result)).toBe(true);
  }
});
test("stores tiny versioned metadata, coalesces unchanged notifications and owns its storage listener", () => {
  const backing = storage(),
    events = new EventTarget(),
    add = vi.spyOn(events, "addEventListener"),
    remove = vi.spyOn(events, "removeEventListener"),
    store = new SnappingPreferenceStore(() => backing, events),
    first = vi.fn(),
    second = vi.fn();
  expect(store.read()).toBe(DEFAULT_SNAPPING);
  const a = store.subscribe(first),
    b = store.subscribe(second);
  expect(add).toHaveBeenCalledOnce();
  store.update({ enabled: false, threshold: 8.5 });
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(JSON.parse(backing.values.get(SNAPPING_STORAGE_KEY)!)).toEqual({
    version: 1,
    enabled: false,
    threshold: 8.5,
  });
  store.update({ enabled: false });
  expect(first).toHaveBeenCalledOnce();
  a();
  expect(remove).not.toHaveBeenCalled();
  store.reset();
  expect(store.read()).toEqual(DEFAULT_SNAPPING);
  expect(second).toHaveBeenCalledTimes(2);
  b();
  expect(remove).toHaveBeenCalledOnce();
  const reopen = new SnappingPreferenceStore(() => backing, events);
  expect(reopen.read()).toEqual(DEFAULT_SNAPPING);
});
test("handles external updates and clears without adopting invalid records or unrelated keys", () => {
  const backing = storage(),
    events = new EventTarget(),
    store = new SnappingPreferenceStore(() => backing, events),
    changed = vi.fn(),
    stop = store.subscribe(changed);
  const dispatch = (key: string | null) =>
    events.dispatchEvent(new StorageEvent("storage", { key }));
  backing.setItem(
    SNAPPING_STORAGE_KEY,
    JSON.stringify({ version: 1, enabled: false, threshold: 24 }),
  );
  dispatch("another-preference");
  expect(changed).not.toHaveBeenCalled();
  dispatch(SNAPPING_STORAGE_KEY);
  expect(store.read()).toEqual({ enabled: false, threshold: 24 });
  for (const value of [
    "{",
    "null",
    JSON.stringify({ version: 2 }),
    "x".repeat(257),
    JSON.stringify({ version: 1, enabled: true, threshold: 0 }),
  ]) {
    backing.setItem(SNAPPING_STORAGE_KEY, value);
    dispatch(SNAPPING_STORAGE_KEY);
    expect(store.read()).toEqual({ enabled: false, threshold: 24 });
  }
  backing.values.clear();
  dispatch(null);
  expect(store.read()).toEqual(DEFAULT_SNAPPING);
  stop();
  backing.setItem(
    SNAPPING_STORAGE_KEY,
    JSON.stringify({ version: 1, enabled: false, threshold: 3 }),
  );
  const fresh = store.subscribe(changed);
  expect(store.read()).toEqual({ enabled: false, threshold: 3 });
  fresh();
});
test("blocked storage keeps the last valid session value when settings subscribe or reopen", () => {
  const backing = storage(JSON.stringify({ version: 1, enabled: true, threshold: 4 }));
  const store = new SnappingPreferenceStore(
    () => ({
      ...backing,
      setItem() {
        throw Error("quota");
      },
    }),
    undefined,
  );
  store.update({ enabled: false, threshold: 12 });
  const stop = store.subscribe(() => undefined);
  expect(store.read()).toEqual({ enabled: false, threshold: 12 });
  stop();
  const stopAgain = store.subscribe(() => undefined);
  expect(store.read()).toEqual({ enabled: false, threshold: 12 });
  stopAgain();
  const blocked = new SnappingPreferenceStore(() => {
    throw Error("denied");
  }, undefined);
  blocked.update({ enabled: false });
  blocked.subscribe(() => undefined)();
  expect(blocked.read()).toEqual({ enabled: false, threshold: 6 });
  expect(new SnappingPreferenceStore(() => storage("{}"), undefined).read()).toEqual(
    DEFAULT_SNAPPING,
  );
});
test("the writable atom observes command changes and persists its own updates", () => {
  const original = snappingPreferences.read(),
    store = createStore(),
    changed = vi.fn(),
    unsubscribe = store.sub(snappingAtom, changed);
  try {
    snappingPreferences.update({ enabled: !original.enabled, threshold: 10 });
    expect(store.get(snappingAtom)).toEqual({ enabled: !original.enabled, threshold: 10 });
    store.set(snappingAtom, { threshold: 14 });
    expect(snappingPreferences.read().threshold).toBe(14);
    expect(changed).toHaveBeenCalled();
  } finally {
    unsubscribe();
    snappingPreferences.update(original);
  }
});
