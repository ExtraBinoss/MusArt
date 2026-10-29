import { expect, it } from "vitest";
import { createProject } from "@musart/core";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { readMediaOriginal } from "../../../../src/services/projects/media/read";
import { templateMedia } from "../../../support/motion-template-media";
it("rejects cancellation, missing and mismatched sidecars without fabricated source bytes", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    asset = templateMedia().video;
  const project = createProject();
  try {
    const abort = new AbortController();
    abort.abort();
    await expect(readMediaOriginal(db, project.id, asset, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(readMediaOriginal(db, project.id, asset)).rejects.toThrow("missing");
    await db.put("projects", { id: project.id, project });
    await db.put("mediaOriginalMeta", {
      projectId: project.id,
      originalId: asset.originalId,
      contentRevision: "wrong",
      byteLength: 9,
    });
    await expect(readMediaOriginal(db, project.id, asset)).rejects.toThrow("stale");
    await db.put("mediaOriginalMeta", {
      projectId: project.id,
      originalId: asset.originalId,
      contentRevision: asset.contentRevision,
      byteLength: 9,
    });
    await expect(readMediaOriginal(db, project.id, asset)).rejects.toThrow("corrupt");
  } finally {
    db.close();
  }
});
