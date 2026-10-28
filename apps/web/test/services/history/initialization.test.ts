import { it, expect, vi } from "vitest";
import { createProject } from "@musart/core";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { initializeHistory } from "../../../src/services/history/initialization";
import { writeHistory } from "../../../src/services/history/transactions";
it("initializes once in the callers transaction without replacing an existing journal", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    project = createProject();
  try {
    const first = await writeHistory(db, (tx) =>
      initializeHistory(tx, project, project.pages[0]!.id, "fingerprint"),
    );
    const second = await writeHistory(db, (tx) =>
      initializeHistory(tx, { ...project, name: "Other" }, project.pages[0]!.id, "other"),
    );
    expect(second).toEqual(first);
    expect(first.bytes!.base).toBeGreaterThan(0);
    expect((await db.get("journalBase", project.id))!.state.name).toBe(project.name);
  } finally {
    db.close();
  }
});
it("adopts one epoch for legacy headers without scanning or rewriting events and preserves it across sessions", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    project = createProject();
  try {
    const initial = await writeHistory(db, (tx) =>
      initializeHistory(tx, project, project.pages[0]!.id, "same"),
    );
    const { epoch: _epoch, ...legacy } = initial;
    await db.put("journalMeta", legacy);
    const reads = vi.spyOn(IDBObjectStore.prototype, "getAll"),
      cursor = vi.spyOn(IDBObjectStore.prototype, "openCursor");
    const adopted = await writeHistory(db, (tx) =>
      initializeHistory(tx, project, project.pages[0]!.id, "same"),
    );
    expect(adopted.epoch).toMatch(/^[0-9a-f-]{36}$/);
    expect({ ...adopted, epoch: undefined }).toEqual({ ...legacy, epoch: undefined });
    expect(
      await writeHistory(db, (tx) => initializeHistory(tx, project, project.pages[0]!.id, "same")),
    ).toEqual(adopted);
    expect(
      reads.mock.contexts.filter((store) => (store as IDBObjectStore).name === "journalEvents"),
    ).toHaveLength(0);
    expect(
      cursor.mock.contexts.filter((store) => (store as IDBObjectStore).name === "journalEvents"),
    ).toHaveLength(0);
  } finally {
    db.close();
  }
});
