import { expect, test, vi } from "vitest";
import { deleteDB } from "idb";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateReplay,
  type Asset,
} from "../../packages/core/src/index";
import { ProjectStore } from "../../apps/web/src/services/projects/storage";
import { openStudioDatabase } from "../../apps/web/src/services/projects/database";
import { AnimationSession } from "../../apps/web/src/services/animation/session";

test("legacy usage accounting remains stable when originals are migrated on the next save", async () => {
  const name = `usage-legacy-audit-${crypto.randomUUID()}`,
    store = new ProjectStore(name),
    db = await openStudioDatabase(name);
  try {
    const asset: Asset = {
      id: "original",
      name: "Image",
      mime: "image/png",
      width: 10,
      height: 10,
      dataUrl: "data:image/png;base64,QUJDRA==",
    };
    const project = createProject({ assets: { original: asset } });
    await db.put("projects", { id: project.id, storageVersion: 1, project });
    const before = await store.usage(project.id);
    expect(before.bytes.assets).toBeGreaterThan(0);
    await store.save(await store.load(project.id));
    const after = await store.usage(project.id);
    expect(after.bytes.assets).toBe(before.bytes.assets);
  } finally {
    db.close();
    await store.close();
    await deleteDB(name);
  }
});

test("clearing queued edits preserves the captured document and replays later edits exactly once", async () => {
  const name = `usage-clear-audit-${crypto.randomUUID()}`,
    store = new ProjectStore(name);
  const layer = createLayer("rectangle", { id: "queued-shape" }),
    project = createProject({ pages: [createPage({ layers: [layer] })] }),
    engine = new EditorEngine(project),
    session = new AnimationSession(engine),
    errors: unknown[] = [];
  try {
    await store.save(project);
    session.attach(store.history, (error) => errors.push(error));
    await session.flush();
    engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: 1 } });
    const clearing = session.clear();
    engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: 2 } });
    await clearing;
    await session.flush();
    const replay = await session.replay();
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(2);
    expect(replay.initial.pages[0]!.layers[0]!.x).toBe(1);
    expect(replay.events).toHaveLength(1);
    expect(errors).toEqual([]);
    const scans: string[] = [];
    const original = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      scans.push(this.name);
      return Reflect.apply(original, this, args);
    });
    const usage = await store.usage(project.id);
    expect(usage.history.count).toBe(1);
    expect(scans).not.toContain("journalEvents");
    expect(scans).not.toContain("journalAssets");
    expect(scans).not.toContain("assets");
  } finally {
    await session.dispose();
    await store.close();
    await deleteDB(name);
  }
});

test("retention counters equal native stored payloads and deletion removes every project store", async () => {
  const name = `usage-retention-audit-${crypto.randomUUID()}`,
    store = new ProjectStore(name),
    db = await openStudioDatabase(name),
    layer = createLayer("rectangle", { id: "retained-shape" }),
    project = createProject({ pages: [createPage({ layers: [layer] })] }),
    engine = new EditorEngine(project),
    session = new AnimationSession(engine);
  try {
    await store.save(project);
    session.attach(store.history, (error) => {
      throw error;
    });
    await session.flush();
    await session.configure({ limit: 10 });
    for (let index = 0; index < 25; index++)
      engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: index + 1 } });
    await session.flush();
    await store.save(engine.getSnapshot().project);
    const events = await db.getAllFromIndex("journalEvents", "by-project", project.id),
      base = await db.get("journalBase", project.id),
      usage = await store.usage(project.id);
    const encoder = new TextEncoder();
    const measured = events.reduce((sum, record) => {
      const { cumulativeBytes: _cache, ...payload } = record;
      return sum + encoder.encode(JSON.stringify(payload)).byteLength;
    }, 0);
    expect(usage.history.count).toBe(events.length);
    expect(events.length).toBeLessThanOrEqual(10);
    expect(usage.bytes.historyEvents).toBe(measured);
    expect(usage.bytes.historyBase).toBe(encoder.encode(JSON.stringify(base)).byteLength);
    expect(usage.bytes.total).toBe(
      Object.entries(usage.bytes)
        .filter(([key]) => key !== "total")
        .reduce((sum, [, value]) => sum + value, 0),
    );
    const summary = (await store.list())[0]!;
    await store.saveThumbnail({
      projectId: project.id,
      pageId: project.pages[0]!.id,
      revision: summary.pages[0]!.thumbnailRevision!,
      width: 10,
      height: 10,
      blob: new Blob(["encoded thumbnail"], { type: "image/webp" }),
      updatedAt: "2026-10-27T00:00:00Z",
    });
    await session.dispose();
    await store.remove(project.id);
    expect(await db.get("projects", project.id)).toBeUndefined();
    expect(await db.get("journalMeta", project.id)).toBeUndefined();
    expect(await db.get("journalBase", project.id)).toBeUndefined();
    for (const table of ["assets", "journalAssets", "journalEvents", "thumbnails"] as const)
      expect(await db.countFromIndex(table, "by-project", project.id)).toBe(0);
    expect(await store.last()).toBeUndefined();
  } finally {
    await session.dispose();
    db.close();
    await store.close();
    await deleteDB(name);
  }
});
