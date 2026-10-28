import { it, expect } from "vitest";
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
