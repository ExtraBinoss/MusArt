import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { MotionPresetStore } from "../../../../src/services/motion/animations/presets";
const stores: MotionPresetStore[] = [],
  names = new Set<string>();
function store(name = `animation-${crypto.randomUUID()}`) {
  const store = new MotionPresetStore(name);
  stores.push(store);
  names.add(name);
  return { store, name };
}
const preset = (id = crypto.randomUUID()) => ({
  ...structuredClone(MOTION_ANIMATION_PRESETS[0]!),
  id,
  name: "My entrance",
});
afterEach(async () => {
  for (const store of stores.splice(0)) store.dispose();
  for (const name of names) await deleteDB(name);
  names.clear();
});
describe("global personal animation presets", () => {
  it("survives connection reload and exposes bounded pages without storing project identities", async () => {
    const first = store();
    for (let i = 0; i < 5; i++) await first.store.save(preset());
    first.store.dispose();
    const second = store(first.name);
    const page = await second.store.list(undefined, 2);
    expect(page.items).toHaveLength(2);
    expect(page.before).not.toBeNull();
    const next = await second.store.list(page.before!, 2);
    expect(next.items).toHaveLength(2);
    expect(next.items.some((record) => page.items.some((first) => first.id === record.id))).toBe(
      false,
    );
    expect(JSON.stringify(page.items)).not.toContain('"layerId"');
  });
  it("rejects stale concurrent edits and late writes after deletion", async () => {
    const first = store(),
      second = store(first.name);
    const record = await first.store.save(preset());
    const results = await Promise.allSettled([
      first.store.save({ ...record.preset, name: "A" }, record.revision),
      second.store.save({ ...record.preset, name: "B" }, record.revision),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const current = (await first.store.list()).items[0]!;
    await first.store.delete(current);
    await expect(second.store.save(current.preset, current.revision)).rejects.toThrow();
    await expect(second.store.save(current.preset)).rejects.toThrow();
    expect((await second.store.list()).items).toEqual([]);
  });
  it("reports invalid records and rejects disposed stores without a successful save", async () => {
    const { store: owner } = store();
    const invalid = preset();
    invalid.channels = [];
    await expect(owner.save(invalid)).rejects.toThrow();
    owner.dispose();
    await expect(owner.save(preset())).rejects.toThrow("closed");
  });
});
