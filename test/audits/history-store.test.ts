import { afterEach, expect, it, vi } from "vitest";
import {
  createProject,
  evaluateReplay,
  stateFromProject,
  type Asset,
  type ReplayEvent,
} from "../../packages/core/src/index";
import { openStudioDatabase } from "../../apps/web/src/services/projects/database";
import { HistoryStore } from "../../apps/web/src/services/history/store";
const connections: Awaited<ReturnType<typeof openStudioDatabase>>[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
});
async function fixture() {
  const db = await openStudioDatabase(crypto.randomUUID());
  connections.push(db);
  return { db, store: new HistoryStore(() => Promise.resolve(db)) };
}
it("initial history mounting reads metadata only and does not enumerate old journal entries", async () => {
  const { store } = await fixture(),
    project = createProject();
  const all = vi.spyOn(IDBObjectStore.prototype, "getAll"),
    cursor = vi.spyOn(IDBObjectStore.prototype, "openCursor");
  await store.ensure(project, project.pages[0]!.id);
  await store.ensure(project, project.pages[0]!.id);
  expect(all).not.toHaveBeenCalled();
  expect(cursor).not.toHaveBeenCalled();
  expect(await store.info(project.id)).toMatchObject({ count: 0, next: 0 });
});
it("an original-asset conflict atomically rolls back an already-written event and all metadata", async () => {
  const { store, db } = await fixture();
  const asset: Asset = {
    id: "original",
    name: "photo",
    width: 1,
    height: 1,
    mime: "image/png",
    dataUrl: "original-data",
  };
  const project = createProject({ assets: { original: asset } });
  await store.ensure(project, project.pages[0]!.id);
  const before = await store.info(project.id),
    event: ReplayEvent = {
      at: 1,
      projectId: project.id,
      pageId: project.pages[0]!.id,
      kind: "commit",
      commands: [],
      delta: [],
    };
  await expect(
    store.append(project.id, event, { original: { ...asset, dataUrl: "replacement" } }, "changed"),
  ).rejects.toThrow("cannot be replaced");
  expect(await store.info(project.id)).toEqual(before);
  expect(await db.count("journalEvents")).toBe(0);
  expect((await db.get("journalAssets", [project.id, asset.id]))!.asset.dataUrl).toBe(
    "original-data",
  );
});
it("bounded purge advances the replay checkpoint and paginates without duplicates or lost final state", async () => {
  const { store } = await fixture(),
    project = createProject();
  const pageId = project.pages[0]!.id;
  await store.ensure(project, pageId);
  await store.configure(project.id, { limit: 10 });
  for (let index = 0; index < 25; index++) {
    const after = stateFromProject({ ...project, name: `frame-${index}` });
    await store.append(
      project.id,
      { at: index, projectId: project.id, pageId, kind: "commit", commands: [], delta: [], after },
      {},
      `stamp-${index}`,
    );
  }
  const meta = (await store.info(project.id))!;
  expect(meta.count).toBeLessThanOrEqual(10);
  const first = await store.page(project.id, undefined, 3),
    second = await store.page(project.id, first.before!, 3);
  expect(first.entries).toHaveLength(3);
  expect(new Set([...first.entries, ...second.entries].map((entry) => entry.sequence)).size).toBe(
    6,
  );
  const replay = await store.replay(project.id);
  expect(replay.events).toHaveLength(meta.count);
  expect(evaluateReplay(replay, replay.duration).name).toBe("frame-24");
});
