import { expect, test } from "vitest";
import { deleteDB } from "idb";
import { createProject, createPage, evaluateReplay } from "../../packages/core/src/index";
import { HistoryStore } from "../../apps/web/src/services/history/store";
import { openStudioDatabase } from "../../apps/web/src/services/projects/database";

test("reconciles a replaced project manifest even when its user-supplied timestamp is unchanged", async () => {
  const name = `journal-audit-${crypto.randomUUID()}`,
    connection = openStudioDatabase(name),
    store = new HistoryStore(() => connection);
  try {
    const original = createProject({
      updatedAt: "2026-10-27T10:00:00.000Z",
      pages: [createPage({ width: 600, height: 400 })],
    });
    await store.ensure(original, original.pages[0]!.id);
    const replaced = structuredClone(original);
    replaced.pages[0]!.width = 900;
    await store.ensure(replaced, replaced.pages[0]!.id);
    const replay = await store.replay(original.id);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.width).toBe(900);
  } finally {
    (await connection).close();
    await deleteDB(name);
  }
});
