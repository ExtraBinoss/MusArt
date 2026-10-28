import { expect, it, vi } from "vitest";
import {
  refreshThumbnailSchema,
  type ThumbnailSchemaBasis,
} from "../../../../src/services/projects/persistence/thumbnail-schema";
import { persistProjectWrite } from "../../../../src/services/projects/persistence/transaction";
import { THUMBNAIL_RENDER_VERSION } from "../../../../src/services/projects/thumbnails/model";
import { retireProject } from "../../../../src/services/projects/lifecycle";
import { manifestBytes } from "../../../../src/services/projects/records";
import { fixture } from "./fixtures";

async function legacy() {
  const d = await fixture(),
    result = await persistProjectWrite(d.db, d.frame);
  const record = (await d.db.get("projects", d.project.id))!;
  record.thumbnailRenderVersion = "gpu-webp-768-88-v2";
  record.pageRevisions = { page: "old-renderer" };
  record.bytes!.manifest = manifestBytes(record);
  await d.db.put("projects", record);
  const basis: ThumbnailSchemaBasis = {
    id: d.project.id,
    writeRevision: result.writeRevision,
    rendererVersion: record.thumbnailRenderVersion,
    storageVersion: record.storageVersion,
    assetsRevision: result.assetsRevision,
    pageIds: ["page"],
  };
  return { ...d, record, basis };
}
it("updates only pixel metadata/accounting without writing originals, history or the document CAS token", async () => {
  const d = await legacy();
  try {
    const preferences = await d.db.getAll("preferences"),
      assets = await d.db.getAll("assets"),
      put = vi.spyOn(IDBObjectStore.prototype, "put");
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "new-pixels" })).toBe(true);
    expect(put.mock.contexts.map((store) => (store as IDBObjectStore).name)).toEqual(["projects"]);
    const current = (await d.db.get("projects", d.project.id))!;
    expect(current).toMatchObject({
      pageRevisions: { page: "new-pixels" },
      thumbnailRenderVersion: THUMBNAIL_RENDER_VERSION,
    });
    expect(current.project).toEqual(d.record.project);
    expect(current.bytes!.manifest).toBe(manifestBytes(current));
    expect(await d.db.getAll("preferences")).toEqual(preferences);
    expect(await d.db.getAll("assets")).toEqual(assets);
    expect(await d.db.count("journalEvents")).toBe(0);
    put.mockClear();
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "new-pixels" })).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "wrong-pixels" })).toBe(false);
  } finally {
    d.db.close();
  }
});
it("rejects stale tokens, changed originals/pages/schema, deletion and abandoned generations atomically", async () => {
  const d = await legacy();
  try {
    for (const patch of [
      { writeRevision: "foreign" },
      { assetsRevision: "foreign" },
      { storageVersion: undefined },
      { rendererVersion: "foreign" },
      { pageIds: [] },
      { pageIds: ["other"] },
    ]) {
      const basis = { ...d.basis, ...patch };
      const revisions = Object.fromEntries(basis.pageIds.map((id) => [id, "pixels"]));
      expect(await refreshThumbnailSchema(d.db, basis, revisions)).toBe(false);
      expect(await d.db.get("projects", d.project.id)).toEqual(d.record);
    }
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "pixels" }, () => false)).toBe(
      false,
    );
    const current = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "pixels" }, current)).toBe(false);
    const tx = d.db.transaction("preferences", "readwrite");
    await retireProject(tx.store, d.project.id);
    await tx.done;
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "pixels" })).toBe(false);
    await d.db.delete("projects", d.project.id);
    expect(await refreshThumbnailSchema(d.db, d.basis, { page: "pixels" })).toBe(false);
    expect(await d.db.get("projects", d.project.id)).toBeUndefined();
  } finally {
    d.db.close();
  }
});
it("rejects invalid hashes and rolls back failures without hiding the storage error", async () => {
  const d = await legacy();
  try {
    await expect(refreshThumbnailSchema(d.db, d.basis, {})).rejects.toThrow(
      "Invalid thumbnail schema",
    );
    await expect(refreshThumbnailSchema(d.db, d.basis, { page: "" })).rejects.toThrow(
      "Invalid thumbnail schema",
    );
    await expect(
      refreshThumbnailSchema(d.db, d.basis, { page: 3 } as unknown as Record<string, string>),
    ).rejects.toThrow("Invalid thumbnail schema");
    const native = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (
      this: IDBObjectStore,
      ...args
    ) {
      if (this.name === "projects") throw Error("Metadata quota");
      return native.apply(this, args);
    });
    await expect(refreshThumbnailSchema(d.db, d.basis, { page: "new" })).rejects.toThrow(
      "Metadata quota",
    );
    expect(await d.db.get("projects", d.project.id)).toEqual(d.record);
  } finally {
    d.db.close();
  }
});

it("refreshes a genuine legacy record without inventing byte accounting or rewriting embedded originals", async () => {
  const d = await legacy();
  try {
    await d.db.put("projects", { id: d.project.id, project: d.project });
    expect(
      await refreshThumbnailSchema(
        d.db,
        {
          ...d.basis,
          rendererVersion: undefined,
          storageVersion: undefined,
          assetsRevision: undefined,
        },
        { page: "new" },
      ),
    ).toBe(true);
    const current = (await d.db.get("projects", d.project.id))!;
    expect(current.project).toEqual(d.project);
    expect(current.bytes).toBeUndefined();
    expect(current.thumbnailRenderVersion).toBe(THUMBNAIL_RENDER_VERSION);
  } finally {
    d.db.close();
  }
});
