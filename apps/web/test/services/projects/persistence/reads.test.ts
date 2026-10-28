import { expect, test, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { createProject } from "@musart/core";
import {
  openStudioDatabase,
  type StoredThumbnail,
} from "../../../../src/services/projects/database";
import {
  readThumbnailInfo,
  readThumbnails,
} from "../../../../src/services/projects/persistence/reads";
import { thumbnailInfo } from "../../../../src/services/projects/records";

test("returns only current requested thumbnails, deduplicates IDs and exposes small headers", async () => {
  vi.stubGlobal("Blob", NodeBlob);
  const db = await openStudioDatabase(`thumbnail-reads-${crypto.randomUUID()}`);
  const project = createProject(),
    pageId = project.pages[0]!.id;
  const record: StoredThumbnail = {
    projectId: project.id,
    pageId,
    revision: "current",
    width: 20,
    height: 10,
    blob: new Blob(["thumbnail"], { type: "image/webp" }),
    updatedAt: project.updatedAt,
  };
  const info = thumbnailInfo(record);
  try {
    expect(await readThumbnailInfo(db, project.id)).toEqual([]);
    expect(await readThumbnails(db, project.id)).toEqual([]);
    await db.put("projects", {
      id: project.id,
      project,
      storageVersion: 2,
      pageRevisions: { [pageId]: "current" },
      thumbnailInfo: [info],
    });
    await db.put("thumbnails", record);
    await db.put("thumbnails", { ...record, pageId: "old-page", revision: "stale" });
    expect(await readThumbnailInfo(db, project.id)).toEqual([info]);
    expect(await readThumbnails(db, project.id, [pageId, pageId, "missing"])).toHaveLength(1);
    expect(await readThumbnails(db, project.id)).toHaveLength(1);
    const manifest = (await db.get("projects", project.id))!;
    manifest.pageRevisions = { [pageId]: "new-paint" };
    await db.put("projects", manifest);
    expect(await readThumbnails(db, project.id, [pageId])).toEqual([]);
    expect(await readThumbnails(db, project.id, [pageId, "old-page"], true)).toEqual([
      { ...record, stale: true },
    ]);
    expect(await db.get("thumbnails", [project.id, pageId])).not.toHaveProperty("stale");
    await expect(
      readThumbnails(db, project.id, [pageId], "yes" as unknown as boolean),
    ).rejects.toThrow("stale option");
    expect(await readThumbnails(db, project.id, [])).toEqual([]);
    await db.delete("projects", project.id);
    expect(await readThumbnails(db, project.id, [pageId])).toEqual([]);
    await expect(
      readThumbnails(
        db,
        project.id,
        Array.from({ length: 101 }, () => pageId),
      ),
    ).rejects.toThrow("page selection");
    db.close();
    await expect(readThumbnailInfo(db, project.id)).rejects.toThrow();
    await expect(readThumbnails(db, project.id)).rejects.toThrow();
  } finally {
    db.close();
    vi.unstubAllGlobals();
  }
});
