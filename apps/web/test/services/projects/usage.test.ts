import { it, expect, vi } from "vitest";
import {
  createProject,
  createPage,
  createLayer,
  diffReplayState,
  stateFromProject,
} from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { projectUsage, estimateOriginStorage } from "../../../src/services/projects/usage";
import { logicalBytes } from "../../../src/services/projects/logical-bytes";
import { manifestBytes } from "../../../src/services/projects/records";
import { eventBytes, metadataBytes } from "../../../src/services/history/accounting";
it("reports independent logical payload categories and serves cached insights without scanning events or originals", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    project = createProject({
      id: "p",
      pages: [createPage({ id: "page", layers: [createLayer("rectangle", { id: "shape" })] })],
      assets: {
        photo: {
          id: "photo",
          name: "Photo",
          mime: "image/png",
          width: 10,
          height: 10,
          dataUrl: "data:image/png;base64,AAAA",
        },
      },
    });
  await store.save(project, "data:image/webp;base64,old");
  const db = await openStudioDatabase(name);
  try {
    await store.history.ensure(project, "page");
    const next = { ...project, name: "Changed" };
    await store.history.append(
      "p",
      {
        projectId: "p",
        pageId: "page",
        at: 1,
        kind: "commit",
        commands: [{ type: "renameProject", name: "Changed" }],
        delta: diffReplayState(stateFromProject(project), stateFromProject(next)),
      },
      {},
      next.updatedAt,
      1,
      { expectedNext: 0, current: stateFromProject(next) },
    );
    const usage = await store.usage("p"),
      record = (await db.get("projects", "p"))!,
      originals = await db.getAll("assets"),
      events = await db.getAll("journalEvents"),
      pool = await db.getAll("journalAssets"),
      base = await db.get("journalBase", "p"),
      meta = (await db.get("journalMeta", "p"))!;
    expect(usage.basis).toBe("logical-utf8");
    expect(usage.bytes).toMatchObject({
      manifest: manifestBytes(record),
      assets: originals.reduce((sum, entry) => sum + logicalBytes(entry), 0),
      thumbnails: logicalBytes({ thumbnail: "data:image/webp;base64,old" }),
      historyEvents: events.reduce((sum, entry) => sum + eventBytes(entry), 0),
      historyAssets: pool.reduce((sum, entry) => sum + logicalBytes(entry), 0),
      historyBase: logicalBytes(base),
      historyMetadata: metadataBytes(meta),
    });
    const { total, ...categories } = usage.bytes;
    expect(total).toBe(Object.values(categories).reduce((sum, value) => sum + value, 0));
    expect(usage.history).toEqual({ count: 1, limit: 10000, enabled: true });
    const scans = vi.spyOn(IDBObjectStore.prototype, "getAll"),
      cursors = vi.spyOn(IDBIndex.prototype, "openCursor");
    await store.usage("p");
    expect(scans).not.toHaveBeenCalled();
    expect(cursors).not.toHaveBeenCalled();
    expect((await store.list())[0]!.pages[0]!.thumbnailRevision).toHaveLength(64);
  } finally {
    db.close();
    await store.close();
  }
});
it("lazily accounts legacy full originals and missing v2 counters exactly once, rejecting absent projects", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    db = await openStudioDatabase(name),
    asset = {
      id: "a",
      name: "Original",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
    },
    project = createProject({ id: "legacy", assets: { a: asset } });
  try {
    await db.put("projects", { id: project.id, project, thumbnail: "legacy-preview" });
    const usage = await store.usage(project.id);
    expect(usage.bytes.assets).toBe(
      logicalBytes({ projectId: project.id, assetId: "a", dataUrl: asset.dataUrl }),
    );
    expect(usage.history.count).toBe(0);
    expect((await db.get("projects", project.id))!.bytes).toBeDefined();
    await store.save(project);
    expect((await store.usage(project.id)).bytes.assets).toBe(usage.bytes.assets);
    const record = (await db.get("projects", project.id))!;
    delete record.bytes;
    await db.put("projects", record);
    const backfill = await projectUsage(db, project.id);
    expect(backfill.bytes.assets).toBe(usage.bytes.assets);
    await expect(store.usage("missing")).rejects.toThrow("introuvable");
  } finally {
    db.close();
    await store.close();
  }
});
it("exposes browser-wide estimates explicitly as approximate and tolerates unsupported or denied estimations", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "storage");
  try {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: 123, quota: 456 }) },
    });
    expect(await estimateOriginStorage()).toEqual({ approximate: true, usage: 123, quota: 456 });
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: NaN, quota: undefined }) },
    });
    expect(await estimateOriginStorage()).toEqual({ approximate: true });
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    expect(await estimateOriginStorage()).toBeUndefined();
    Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
    expect(await estimateOriginStorage()).toBeUndefined();
  } finally {
    if (descriptor) Object.defineProperty(navigator, "storage", descriptor);
    else Reflect.deleteProperty(navigator, "storage");
  }
});

it("includes thumbnail binaries during a one-time missing-counter backfill", async () => {
  const name = crypto.randomUUID(),
    db = await openStudioDatabase(name),
    project = createProject({ id: "thumbnail-legacy" });
  try {
    await db.put("projects", { id: project.id, storageVersion: 2, project });
    await db.put("thumbnails", {
      projectId: project.id,
      pageId: project.pages[0]!.id,
      revision: "old",
      blob: new (await import("node:buffer")).Blob(["encoded"]) as Blob,
      width: 10,
      height: 10,
      updatedAt: project.updatedAt,
    });
    const usage = await projectUsage(db, project.id);
    expect(usage.bytes.thumbnails).toBeGreaterThan(7);
    expect((await db.get("projects", project.id))!.bytes!.thumbnails).toBe(usage.bytes.thumbnails);
  } finally {
    db.close();
  }
});
