import { expect, it } from "vitest";
import {
  persistThumbnail,
  validateThumbnail,
} from "../../../../src/services/projects/persistence/thumbnail";
import { persistProjectWrite } from "../../../../src/services/projects/persistence/transaction";
import { fixture } from "./fixtures";
it("merges only current GPU thumbnails and preserves headers across a later document save", async () => {
  const d = await fixture();
  try {
    const result = await persistProjectWrite(d.db, d.frame),
      record = {
        projectId: d.project.id,
        pageId: "page",
        revision: "pixel-revision",
        updatedAt: "2026-10-28T12:00:00.000Z",
        width: 10,
        height: 10,
        blob: new Blob(["real bytes"], { type: "image/webp" }),
      };
    expect(await persistThumbnail(d.db, record)).toBe(true);
    expect(await persistThumbnail(d.db, { ...record, revision: "old-pixels" })).toBe(false);
    await persistProjectWrite(d.db, {
      ...d.frame,
      document: { ...d.frame.document, name: "New name" },
      expectedRevision: result.writeRevision,
    });
    expect((await d.db.get("projects", d.project.id))!.thumbnailInfo).toMatchObject([
      { pageId: "page", bytes: record.blob.size },
    ]);
    await d.db.delete("projects", d.project.id);
    expect(await persistThumbnail(d.db, record)).toBe(false);
    expect(() => validateThumbnail({ ...record, width: 0 })).toThrow("Invalid thumbnail");
  } finally {
    d.db.close();
  }
});
