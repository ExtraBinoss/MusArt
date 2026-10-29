import { expect, it, vi } from "vitest";
import { openDB } from "idb";
import { openStudioDatabase } from "../../../src/services/projects/database";
it("migrates v2 with independent compound-key journal stores while preserving manifests", async () => {
  const name = crypto.randomUUID();
  const old = await openDB(name, 2, {
    upgrade(db) {
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("preferences");
      db.createObjectStore("assets", { keyPath: ["projectId", "assetId"] }).createIndex(
        "by-project",
        "projectId",
      );
    },
  });
  await old.put("preferences", "preserved", "test");
  old.close();
  const db = await openStudioDatabase(name);
  expect(db.version).toBe(7);
  expect(await db.get("preferences", "test")).toBe("preserved");
  expect([...db.objectStoreNames]).toContain("journalEvents");
  db.close();
});
it("upgrades v5 with one unique operation index, preserves unindexed legacy rows and performs no JavaScript journal scan", async () => {
  const name = crypto.randomUUID();
  const old = await openDB(name, 5, {
    upgrade(db) {
      db.createObjectStore("projects", { keyPath: "id" }).createIndex("by-updated", [
        "project.updatedAt",
        "id",
      ]);
      db.createObjectStore("preferences");
      db.createObjectStore("assets", { keyPath: ["projectId", "assetId"] }).createIndex(
        "by-project",
        "projectId",
      );
      db.createObjectStore("thumbnails", { keyPath: ["projectId", "pageId"] }).createIndex(
        "by-project",
        "projectId",
      );
      db.createObjectStore("journalMeta", { keyPath: "projectId" });
      db.createObjectStore("journalBase", { keyPath: "projectId" });
      db.createObjectStore("journalAssets", { keyPath: ["projectId", "assetId"] }).createIndex(
        "by-project",
        "projectId",
      );
      const events = db.createObjectStore("journalEvents", { keyPath: ["projectId", "sequence"] });
      events.createIndex("by-project", "projectId");
      events.createIndex("by-checkpoint", ["projectId", "event.after.id", "sequence"]);
    },
  });
  const event = {
    projectId: "legacy",
    at: 1,
    pageId: "page",
    kind: "commit" as const,
    commands: [],
    delta: [],
  };
  await old.put("journalEvents", { projectId: "legacy", sequence: 0, event });
  await old.put("journalEvents", { projectId: "legacy", sequence: 1, event });
  old.close();
  const read = vi.spyOn(IDBObjectStore.prototype, "getAll"),
    cursor = vi.spyOn(IDBObjectStore.prototype, "openCursor");
  const db = await openStudioDatabase(name);
  try {
    expect(db.version).toBe(7);
    expect(
      read.mock.contexts.filter((store) => (store as IDBObjectStore).name === "journalEvents"),
    ).toHaveLength(0);
    expect(
      cursor.mock.contexts.filter((store) => (store as IDBObjectStore).name === "journalEvents"),
    ).toHaveLength(0);
    const tx = db.transaction("journalEvents", "readonly"),
      index = tx.store.index("by-operation");
    expect(index.unique).toBe(true);
    expect(index.keyPath).toEqual(["projectId", "operationId"]);
    expect(await index.count()).toBe(0);
    await tx.done;
    expect(await db.count("journalEvents")).toBe(2);
    await db.put("journalEvents", { projectId: "legacy", sequence: 2, event, operationId: "uuid" });
    await expect(
      db.put("journalEvents", { projectId: "legacy", sequence: 3, event, operationId: "uuid" }),
    ).rejects.toMatchObject({ name: "ConstraintError" });
    expect(
      await db.getFromIndex("journalEvents", "by-operation", ["legacy", "uuid"]),
    ).toMatchObject({ sequence: 2 });
    await db.put("journalEvents", {
      projectId: "other",
      sequence: 0,
      event: { ...event, projectId: "other" },
      operationId: "uuid",
    });
    expect(await db.count("journalEvents")).toBe(4);
  } finally {
    db.close();
  }
});
