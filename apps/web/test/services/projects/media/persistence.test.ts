import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createProject } from "@musart/core";
import { ProjectStore } from "../../../../src/services/projects/storage";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { mediaOriginalBytes } from "../../../../src/services/projects/media/persistence";
import { templateMedia } from "../../../support/motion-template-media";
const stores: ProjectStore[] = [];
beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  vi.unstubAllGlobals();
});
function setup() {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name);
  stores.push(store);
  const asset = templateMedia().video,
    project = createProject({ assets: { [asset.id]: asset } });
  const original = {
    originalId: asset.originalId,
    contentRevision: asset.contentRevision,
    blob: new Blob(["fakevideo"]),
  };
  return { name, store, asset, project, original };
}
it("atomically stores native binary sidecars, loads manifests lazily and never rereads Blob records during warm saves", async () => {
  const d = setup(),
    db = await openStudioDatabase(d.name);
  try {
    await d.store.save(d.project, undefined, { mediaOriginals: [d.original] });
    const record = (await db.get("projects", d.project.id))!;
    expect(JSON.stringify(record)).not.toContain("fakevideo");
    expect(record.project.assets[d.asset.id]).toEqual(d.asset);
    const header = (await db.get("mediaOriginalMeta", [d.project.id, d.asset.originalId]))!;
    expect(record.bytes!.assets).toBe(mediaOriginalBytes(header));
    const reads = vi.spyOn(IDBObjectStore.prototype, "get");
    expect(await d.store.load(d.project.id)).toEqual(d.project);
    await d.store.saveCurrent({ ...d.project, name: "Changed" });
    expect(
      reads.mock.contexts.filter(
        (context) => (context as IDBObjectStore).name === "mediaOriginals",
      ),
    ).toHaveLength(0);
    const blob = await d.store.loadMediaOriginal(d.project.id, d.asset);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(9);
    await d.store.saveCurrent({ ...d.project, assets: {} });
    expect(await db.count("mediaOriginals")).toBe(1); // Journal/undo may still reference it.
    await d.store.remove(d.project.id);
    expect(await db.count("mediaOriginals")).toBe(0);
    expect(await db.count("mediaOriginalMeta")).toBe(0);
    await expect(
      d.store.save(d.project, undefined, { mediaOriginals: [d.original] }),
    ).rejects.toMatchObject({ code: "PROJECT_DELETED" });
  } finally {
    db.close();
  }
});
it("rolls back every store for missing, conflicting or failed original publication", async () => {
  const d = setup(),
    db = await openStudioDatabase(d.name);
  try {
    await expect(d.store.save(d.project)).rejects.toThrow("missing");
    expect(await db.count("projects")).toBe(0);
    const add = IDBObjectStore.prototype.add;
    const failure = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "mediaOriginalMeta") throw Error("quota");
      return add.apply(this, args);
    });
    await expect(
      d.store.save(d.project, undefined, { mediaOriginals: [d.original] }),
    ).rejects.toThrow("quota");
    failure.mockRestore();
    expect(await db.count("projects")).toBe(0);
    expect(await db.count("mediaOriginals")).toBe(0);
    const conflicting = {
      ...d.project,
      assets: { ...d.project.assets, other: { ...d.asset, id: "other", contentRevision: "other" } },
    };
    await expect(
      d.store.save(conflicting, undefined, { mediaOriginals: [d.original] }),
    ).rejects.toThrow("Conflicting");
    expect(await db.count("mediaOriginalMeta")).toBe(0);
  } finally {
    db.close();
  }
});
it("prepares outside publication, rejects stale CAS and consumes each preparation only once", async () => {
  const d = setup(),
    other = new ProjectStore(d.name);
  stores.push(other);
  const prepared = await d.store.prepareSave(d.project, undefined, {
    mediaOriginals: [d.original],
  });
  expect(await d.store.list()).toEqual([]);
  await other.save(d.project, undefined, { mediaOriginals: [d.original] });
  await expect(d.store.persistPrepared(prepared)).rejects.toMatchObject({
    code: "STALE_PROJECT_WRITE",
  });
  await expect(d.store.persistPrepared(prepared)).rejects.toThrow("consumed");
  const afterClose = await d.store.prepareSave(d.project);
  await d.store.close();
  await expect(d.store.persistPrepared(afterClose)).rejects.toThrow("closed");
});
