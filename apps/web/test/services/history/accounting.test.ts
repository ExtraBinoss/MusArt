import { it, expect, vi } from "vitest";
import { fixture, seed, projectAt, eventAt } from "./fixtures";
import { historyUsage, eventBytes, metadataBytes } from "../../../src/services/history/accounting";
import { logicalBytes } from "../../../src/services/projects/logical-bytes";
it("updates totals incrementally and subtracts prefix counters without scanning a large pruned range", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 320);
    const scans = vi.spyOn(IDBObjectStore.prototype, "getAll");
    await store.configure("history-project", { limit: 10 });
    expect(scans).not.toHaveBeenCalled();
    scans.mockRestore();
    const usage = await store.usage("history-project"),
      events = await db.getAll("journalEvents");
    expect(usage.bytes.events).toBe(events.reduce((sum, event) => sum + eventBytes(event), 0));
    expect(usage.bytes.base).toBe(logicalBytes(await db.get("journalBase", "history-project")));
    expect(usage.count).toBe(10);
    expect(usage.metadata).toBe(metadataBytes((await store.info("history-project"))!));
  } finally {
    db.close();
  }
});
it("backfills v4 event totals in bounded batches only on explicit insights and caches the result", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 205);
    const tx = db.transaction(["journalMeta", "journalEvents"], "readwrite"),
      meta = (await tx.objectStore("journalMeta").get("history-project"))!;
    delete meta.bytes;
    delete meta.eventBytesWritten;
    delete meta.eventBytesPruned;
    await tx.objectStore("journalMeta").put(meta);
    let cursor = await tx.objectStore("journalEvents").openCursor();
    while (cursor) {
      const record = cursor.value;
      delete record.cumulativeBytes;
      await cursor.update(record);
      cursor = await cursor.continue();
    }
    await tx.done;
    const scans = vi.spyOn(IDBObjectStore.prototype, "getAll");
    await store.ensure(projectAt(205), "page");
    expect(scans).not.toHaveBeenCalled();
    const usage = await historyUsage(db, "history-project");
    expect(scans).toHaveBeenCalledTimes(3);
    for (const call of scans.mock.calls) expect(call[1]).toBe(100);
    expect(usage.bytes.events).toBeGreaterThan(0);
    scans.mockClear();
    expect(await store.usage("history-project")).toEqual(usage);
    expect(scans).not.toHaveBeenCalled();
    await store.configure("history-project", { limit: 10 });
    const entries = await db.getAll("journalEvents");
    expect((await store.usage("history-project")).bytes.events).toBe(
      entries.reduce((sum, event) => sum + eventBytes(event), 0),
    );
  } finally {
    db.close();
  }
});
it("returns zero for absent history and diagnoses corrupted legacy sequences instead of caching false totals", async () => {
  const { db, store } = await fixture();
  try {
    expect((await store.usage("missing")).bytes.events).toBe(0);
    await seed(store, 2);
    const meta = (await store.info("history-project"))!;
    delete meta.bytes;
    await db.put("journalMeta", meta);
    await db.delete("journalEvents", ["history-project", 0]);
    await expect(store.usage("history-project")).rejects.toThrow("incomplete");
    expect((await store.info("history-project"))!.bytes).toBeUndefined();
    await db.put("journalEvents", { projectId: "history-project", sequence: 0, event: eventAt(1) });
    meta.count = 3;
    await db.put("journalMeta", meta);
    await expect(store.usage("history-project")).rejects.toThrow("count");
  } finally {
    db.close();
  }
});

it("backfills a legacy original pool and preserves prefix counters after old entries are pruned", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 20);
    await store.configure("history-project", { limit: 10 });
    await db.put("journalAssets", {
      projectId: "history-project",
      assetId: "photo",
      asset: {
        id: "photo",
        name: "Original",
        mime: "image/png",
        width: 1,
        height: 1,
        dataUrl: "data:image/png;base64,AAAA",
      },
    });
    const meta = (await store.info("history-project"))!;
    delete meta.bytes;
    await db.put("journalMeta", meta);
    const usage = await store.usage("history-project");
    expect(usage.bytes.assets).toBeGreaterThan(0);
    for (let index = 21; index <= 30; index++)
      await store.append("history-project", eventAt(index), {}, projectAt(index).updatedAt, 1);
    const records = await db.getAll("journalEvents");
    expect((await store.usage("history-project")).bytes.events).toBe(
      records.reduce((sum, record) => sum + eventBytes(record), 0),
    );
  } finally {
    db.close();
  }
});
