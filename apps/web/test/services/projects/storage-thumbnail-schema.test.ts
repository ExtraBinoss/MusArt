import { expect, it, vi } from "vitest";
import { createProject } from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { THUMBNAIL_RENDER_VERSION } from "../../../src/services/projects/thumbnails/model";
import { thumbnailRevision } from "../../../src/services/projects/thumbnails/revision";
import { readProjectWriteRevision } from "../../../src/services/projects/writes/revision";

async function fixture() {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    project = createProject({ name: "Persisted snapshot" });
  await store.save(project);
  const db = await openStudioDatabase(name),
    record = (await db.get("projects", project.id))!;
  record.thumbnailRenderVersion = "gpu-webp-768-88-v2";
  record.pageRevisions = Object.fromEntries(project.pages.map((page) => [page.id, "old-pixels"]));
  await db.put("projects", record);
  return { name, store, project, db };
}
it("upgrades old renderer metadata before returning mutable loaded input and keeps the loaded CAS baseline valid", async () => {
  const d = await fixture();
  try {
    const tx = d.db.transaction("preferences"),
      before = await readProjectWriteRevision(tx.store, d.project.id);
    await tx.done;
    const writes = vi.spyOn(IDBObjectStore.prototype, "put"),
      loaded = await d.store.load(d.project.id),
      record = (await d.db.get("projects", d.project.id))!;
    expect(record.thumbnailRenderVersion).toBe(THUMBNAIL_RENDER_VERSION);
    expect(record.pageRevisions?.[loaded.pages[0]!.id]).toBe(
      await thumbnailRevision(loaded.pages[0]!, loaded.assets),
    );
    expect(writes.mock.contexts.map((store) => (store as IDBObjectStore).name)).toEqual([
      "projects",
    ]);
    expect(Object.isFrozen(loaded)).toBe(false);
    loaded.pages[0]!.background = "#ff0000";
    loaded.name = "Mutable after load";
    expect((await d.db.get("projects", d.project.id))!.project).toEqual(d.project);
    const reading = d.db.transaction("preferences");
    expect(await readProjectWriteRevision(reading.store, d.project.id)).toBe(before);
    await reading.done;
    writes.mockClear();
    await d.store.saveCurrent(loaded);
    expect((await d.store.load(d.project.id)).name).toBe("Mutable after load");
    writes.mockClear();
    const hash = vi.spyOn(d.store, "thumbnailRevision");
    await d.store.load(d.project.id);
    expect(hash).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  } finally {
    d.db.close();
    await d.store.close();
  }
});
it("a concurrent document save wins while old-schema hashing is pending", async () => {
  const d = await fixture(),
    other = new ProjectStore(d.name),
    original = d.store.thumbnailRevision;
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  vi.spyOn(d.store, "thumbnailRevision").mockImplementationOnce(async (page, assets) => {
    started();
    await gate;
    return original(page, assets);
  });
  try {
    const pending = d.store.load(d.project.id),
      rejected = expect(pending).rejects.toMatchObject({ code: "STALE_PROJECT_WRITE" });
    await ready;
    await other.save({ ...d.project, name: "Concurrent writer wins" });
    release();
    await rejected;
    expect((await other.load(d.project.id)).name).toBe("Concurrent writer wins");
  } finally {
    release();
    d.db.close();
    await d.store.close();
    await other.close();
  }
});
it("closing a store during schema preparation cannot publish hashes into its closed generation", async () => {
  const d = await fixture(),
    original = d.store.thumbnailRevision;
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  vi.spyOn(d.store, "thumbnailRevision").mockImplementationOnce(async (page, assets) => {
    started();
    await gate;
    return original(page, assets);
  });
  try {
    const pending = d.store.load(d.project.id),
      rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await ready;
    await d.store.close();
    release();
    await rejected;
    expect((await d.db.get("projects", d.project.id))!.thumbnailRenderVersion).toBe(
      "gpu-webp-768-88-v2",
    );
  } finally {
    release();
    d.db.close();
    await d.store.close();
  }
});
