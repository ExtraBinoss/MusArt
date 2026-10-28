import { expect, it } from "vitest";
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
  expect(db.version).toBe(5);
  expect(await db.get("preferences", "test")).toBe("preserved");
  expect([...db.objectStoreNames]).toContain("journalEvents");
  db.close();
});
