import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { FontStore } from "../../../src/services/fonts/database";
import { cleanup, count, name, platform, record, store } from "./fixtures";
beforeEach(platform);
afterEach(cleanup);
it("deduplicates originals atomically while storing only small face metadata in listings", async () => {
  const { store: db, databaseName } = store(),
    { file, face } = record();
  const changes = await Promise.all([db.save(file, [face]), db.save(file, [face])]);
  expect(changes.sort((a, b) => Number(a) - Number(b))).toEqual([false, true]);
  await db.save(file, [{ ...face, family: "alias" }]);
  expect(await count(databaseName, "fontFiles")).toBe(1);
  expect(await count(databaseName, "fontFaces")).toBe(2);
  const reads = vi.spyOn(IDBObjectStore.prototype, "getAll");
  expect(await db.faces()).toHaveLength(2);
  expect(reads.mock.contexts.map((context) => (context as IDBObjectStore).name)).toEqual([
    "fontFaces",
  ]);
  expect((await db.file(file.sha256))!.blob.size).toBe(file.size);
  expect(await db.face("example", 400)).toEqual(face);
  expect(await db.face("missing", 400, true)).toBeUndefined();
  await db.save(file, [{ ...face, weight: 700 }]);
  expect((await db.face("example", 650, true))!.weight).toBe(700);
  expect(await db.face("example", 650)).toBeUndefined();
});
it("rolls back a binary insertion when a conflicting alias or quota failure rejects its metadata", async () => {
  const { store: db, databaseName } = store(),
    first = record(),
    second = record("b".repeat(64));
  await db.save(first.file, [first.face]);
  await expect(db.save(second.file, [second.face])).rejects.toMatchObject({ code: "conflict" });
  expect(await db.file(second.file.sha256)).toBeUndefined();
  const original = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.name === "fontFaces") throw new DOMException("Full", "QuotaExceededError");
    return original.call(this, value, key);
  });
  await expect(db.save(second.file, [{ ...second.face, family: "new" }])).rejects.toThrow("Full");
  expect(await count(databaseName, "fontFiles")).toBe(1);
  expect(await db.face("example", 400)).toEqual(first.face);
});
it("rejects late opens and aborts in-flight writes after disposal", async () => {
  const early = store(),
    opening = early.store.faces();
  early.store.dispose();
  await expect(opening).rejects.toMatchObject({ code: "disposed" });
  const { store: db, databaseName } = store(),
    item = record(),
    original = IDBObjectStore.prototype.add;
  await db.faces();
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const request = original.call(this, value, key);
    if (this.name === "fontFiles") queueMicrotask(() => db.dispose());
    return request;
  });
  await expect(db.save(item.file, [item.face])).rejects.toThrow();
  expect(await count(databaseName, "fontFiles")).toBe(0);
  expect(await count(databaseName, "fontFaces")).toBe(0);
  db.dispose();
  await expect(db.faces()).rejects.toMatchObject({ code: "disposed" });
});
it("closes its connection on database deletion instead of reopening and resurrecting records", async () => {
  const databaseName = name(),
    invalidated = vi.fn(),
    db = new FontStore(databaseName, invalidated);
  await db.faces();
  await deleteDB(databaseName);
  expect(invalidated).toHaveBeenCalledOnce();
  await expect(db.faces()).rejects.toMatchObject({ code: "disposed" });
  db.dispose();
});
