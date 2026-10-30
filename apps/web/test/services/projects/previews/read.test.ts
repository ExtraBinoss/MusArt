import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { ProjectStore } from "../../../../src/services/projects/storage";
import { readProjectPreview } from "../../../../src/services/projects/previews/read";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0n0AAAAASUVORK5CYII=";
function project() {
  return createProject({
    pages: [createPage({ layers: [createLayer("image", { assetId: "image" })] })],
    assets: {
      image: { id: "image", name: "Source", mime: "image/png", width: 1, height: 1, dataUrl: png },
    },
  });
}

test("saved hover reads one readonly snapshot without journal access, schema migration or last-project mutation", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    input = project();
  await store.save(input);
  const db = await openStudioDatabase(name);
  try {
    const record = (await db.get("projects", input.id))!;
    delete record.thumbnailRenderVersion;
    await db.put("projects", record);
    const last = await store.last(),
      transaction = vi.spyOn(db, "transaction");
    const result = await readProjectPreview(db, input.id);
    expect(result).toEqual(input);
    expect(transaction).toHaveBeenCalledWith(["projects", "assets", "preferences"], "readonly");
    expect(transaction).toHaveBeenCalledTimes(1);
    transaction.mockRestore();
    expect(await db.get("projects", input.id)).toEqual(record);
    expect(await store.last()).toBe(last);
  } finally {
    db.close();
    await store.close();
  }
});

test("preview loads are detached, abortable and report deleted or missing originals honestly", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    input = project();
  await store.save(input);
  const db = await openStudioDatabase(name);
  try {
    const result = await store.loadPreview(input.id);
    result.name = "Preview-only local change";
    expect((await store.loadPreview(input.id)).name).toBe(input.name);
    const request = new AbortController();
    request.abort();
    await expect(store.loadPreview(input.id, { signal: request.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await db.delete("assets", [input.id, "image"]);
    await expect(readProjectPreview(db, input.id)).rejects.toThrow("original is missing");
    await store.remove(input.id);
    await expect(readProjectPreview(db, input.id)).rejects.toThrow("no longer available");
  } finally {
    db.close();
    await store.close();
  }
});

test("legacy documents are validated without rewriting their storage representation", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    input = project();
  try {
    const record = { id: input.id, project: input };
    await db.put("projects", record);
    expect(await readProjectPreview(db, input.id)).toEqual(input);
    expect(await db.get("projects", input.id)).toEqual(record);
    await db.put("projects", { ...record, project: { ...input, id: "different" } });
    await expect(readProjectPreview(db, input.id)).rejects.toThrow("identity");
  } finally {
    db.close();
  }
});

test("hovering a concurrently changed project never adopts its write revision for the active editor", async () => {
  const name = crypto.randomUUID(),
    active = new ProjectStore(name),
    other = new ProjectStore(name),
    input = project();
  try {
    await active.save(input);
    const loaded = await active.load(input.id);
    await other.save({ ...input, name: "Another session saved this" });
    expect((await active.loadPreview(input.id)).name).toBe("Another session saved this");
    await expect(active.saveCurrent(loaded)).rejects.toMatchObject({ code: "STALE_PROJECT_WRITE" });
  } finally {
    await active.close();
    await other.close();
  }
});
