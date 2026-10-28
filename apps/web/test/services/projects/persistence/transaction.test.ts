import { expect, it, vi } from "vitest";
import {
  persistProjectWrite,
  AssetBasisMismatchError,
} from "../../../../src/services/projects/persistence/transaction";
import { prepareProjectWrite } from "../../../../src/services/projects/persistence/prepare";
import { retireProject } from "../../../../src/services/projects/lifecycle";
import { manifestBytes } from "../../../../src/services/projects/records";
import { fixture } from "./fixtures";
import { THUMBNAIL_RENDER_VERSION } from "../../../../src/services/projects/thumbnails/model";
it("writes originals, manifest, live accounting and preferences atomically, with delta-only warm writes", async () => {
  const d = await fixture();
  try {
    const first = await persistProjectWrite(d.db, d.frame);
    expect(first).toMatchObject({ projectId: d.project.id, assetsRevision: "assets:1" });
    expect(await d.db.get("preferences", "last-project")).toBe(d.project.id);
    const record = (await d.db.get("projects", d.project.id))!;
    expect(record.thumbnailRenderVersion).toBe(THUMBNAIL_RENDER_VERSION);
    expect(record.bytes!.manifest).toBe(manifestBytes(record));
    const next = prepareProjectWrite(
      { ...d.project, name: "Changed" },
      d.frame.pageRevisions,
      d.frame.pagePayloads!,
      { expectedRevision: first.writeRevision },
      undefined,
      { projectId: d.project.id, revision: first.assetsRevision, urls: d.urls },
    );
    const put = vi.spyOn(IDBObjectStore.prototype, "put"),
      all = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const second = await persistProjectWrite(d.db, next.frame);
    expect(second.assetsRevision).toBe(first.assetsRevision);
    expect(
      put.mock.contexts.filter((store) => (store as IDBObjectStore).name === "assets"),
    ).toHaveLength(0);
    expect(
      all.mock.contexts.filter((store) => (store as IDBObjectStore).name === "assets"),
    ).toHaveLength(0);
    expect((await d.db.get("projects", d.project.id))!.project.name).toBe("Changed");
    await expect(persistProjectWrite(d.db, d.frame)).rejects.toMatchObject({
      code: "STALE_PROJECT_WRITE",
    });
  } finally {
    d.db.close();
  }
});
it("rejects stale asset bases before writing and applies changed/deleted originals with exact accounting", async () => {
  const d = await fixture();
  try {
    const first = await persistProjectWrite(d.db, d.frame),
      before = await d.db.get("projects", d.project.id);
    await expect(
      persistProjectWrite(d.db, {
        ...d.frame,
        expectedRevision: first.writeRevision,
        basis: "wrong",
        originals: [],
      }),
    ).rejects.toBeInstanceOf(AssetBasisMismatchError);
    expect(await d.db.get("projects", d.project.id)).toEqual(before);
    const changed = {
      ...d.project,
      assets: { photo: { ...d.project.assets.photo!, dataUrl: "data:image/png;base64,BBBBBBBB" } },
    };
    const next = prepareProjectWrite(
      changed,
      d.frame.pageRevisions,
      [],
      { expectedRevision: first.writeRevision },
      undefined,
      { projectId: d.project.id, revision: first.assetsRevision, urls: d.urls },
    );
    const second = await persistProjectWrite(d.db, next.frame);
    expect(second.assetsRevision).not.toBe(first.assetsRevision);
    expect((await d.db.get("assets", [d.project.id, "photo"]))!.dataUrl).toContain("BBBB");
    const empty = { ...changed, pages: [{ ...changed.pages[0]!, layers: [] }], assets: {} };
    await persistProjectWrite(
      d.db,
      prepareProjectWrite(empty, d.frame.pageRevisions, [], {
        expectedRevision: second.writeRevision,
      }).frame,
    );
    expect(await d.db.count("assets")).toBe(0);
    expect((await d.db.get("projects", d.project.id))!.bytes!.assets).toBe(0);
  } finally {
    d.db.close();
  }
});
it("rolls back payloads and revision on preference failure, and retirement always prevents resurrection", async () => {
  const d = await fixture();
  try {
    const put = IDBObjectStore.prototype.put,
      spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "preferences" && args[1] === "last-project")
          throw Error("preference quota");
        return put.apply(this, args);
      });
    await expect(persistProjectWrite(d.db, d.frame)).rejects.toThrow("preference quota");
    spy.mockRestore();
    expect(await d.db.count("projects")).toBe(0);
    expect(await d.db.count("assets")).toBe(0);
    const tx = d.db.transaction("preferences", "readwrite");
    await retireProject(tx.store, d.project.id);
    await tx.done;
    await expect(persistProjectWrite(d.db, d.frame)).rejects.toMatchObject({
      code: "PROJECT_DELETED",
    });
    expect(await d.db.count("projects")).toBe(0);
  } finally {
    d.db.close();
  }
});
