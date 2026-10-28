import { it, expect } from "vitest";
import { fixture, eventAt, projectAt } from "./fixtures";
import { appendInTransaction } from "../../../src/services/history/append";
import { writeHistory } from "../../../src/services/history/transactions";
it("shares atomic append semantics with other storage operations and respects recording preferences", async () => {
  const { db, store } = await fixture();
  try {
    const result = await writeHistory(db, (tx) =>
      appendInTransaction(tx, {
        projectId: "history-project",
        event: eventAt(1),
        assets: {},
        stamp: projectAt(1).updatedAt,
      }),
    );
    expect(result.count).toBe(1);
    expect(result.bytes!.events).toBeGreaterThan(0);
    await store.configure("history-project", { enabled: false });
    await writeHistory(db, (tx) =>
      appendInTransaction(tx, {
        projectId: "history-project",
        event: eventAt(2),
        assets: {},
        stamp: projectAt(2).updatedAt,
      }),
    );
    expect((await store.info("history-project"))!.count).toBe(1);
  } finally {
    db.close();
  }
});
