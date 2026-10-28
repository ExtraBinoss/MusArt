import { expect, it } from "vitest";
import { writeHistory } from "../../../src/services/history/transactions";
import { fixture } from "./fixtures";
it("rolls back application exceptions and handles an already-aborted native transaction", async () => {
  const { db } = await fixture();
  try {
    await expect(
      writeHistory(db, async (tx) => {
        await tx.objectStore("journalMeta").delete("history-project");
        throw new Error("intentional");
      }),
    ).rejects.toThrow("intentional");
    expect(await db.get("journalMeta", "history-project")).toBeDefined();
    await expect(
      writeHistory(db, async (tx) => {
        tx.abort();
        await tx.done;
      }),
    ).rejects.toThrow();
    expect(await db.get("journalMeta", "history-project")).toBeDefined();
  } finally {
    db.close();
  }
});
