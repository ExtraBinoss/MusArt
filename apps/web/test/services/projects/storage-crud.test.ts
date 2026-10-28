import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { createProject, createPage, evaluateReplay } from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
import { openStudioDatabase } from "../../../src/services/projects/database";
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
});
afterEach(() => vi.unstubAllGlobals());
it("captures thumbnail getters and immutable Blob before validating or queueing a save", async () => {
  const store = new ProjectStore(crypto.randomUUID()),
    project = createProject({ id: "thumbnail-capture" });
  try {
    await store.save(project);
    const page = (await store.list())[0]!.pages[0]!,
      pageId = vi.fn(() => page.id),
      input = {
        projectId: project.id,
        get pageId() {
          return pageId();
        },
        revision: page.thumbnailRevision!,
        blob: new Blob(["captured"], { type: "image/webp" }),
        width: 40,
        height: 40,
        updatedAt: project.updatedAt,
      },
      saving = store.saveThumbnail(input);
    Object.defineProperty(input, "pageId", { value: "replaced" });
    input.revision = "stale-after-call";
    input.blob = new Blob(["later"]);
    expect(await saving).toBe(true);
    expect(pageId).toHaveBeenCalledOnce();
    const [actual] = await store.thumbnails(project.id, [page.id]);
    expect(actual).toMatchObject({ pageId: page.id, revision: page.thumbnailRevision });
    expect(await actual!.blob.text()).toBe("captured");
  } finally {
    await store.close();
  }
});
it("renames through a valid command, preserves last-opened preference and journals genuine rename metadata", async () => {
  const store = new ProjectStore(crypto.randomUUID()),
    first = createProject({ id: "first" }),
    last = createProject({ id: "last" });
  try {
    await store.save(first);
    await store.history.ensure(first, first.pages[0]!.id);
    await store.save(last);
    await store.rename("first", "Renamed");
    expect((await store.load("first")).name).toBe("Renamed");
    expect(await store.last()).toBe("last");
    const replay = await store.history.replay("first");
    expect(replay.events[0]!.commands).toEqual([{ type: "renameProject", summary: true }]);
    expect(evaluateReplay(replay, replay.duration).name).toBe("Renamed");
    await expect(store.rename("first", " ")).rejects.toThrow("invalide");
    await expect(store.rename("missing", "Name")).rejects.toThrow("introuvable");
  } finally {
    await store.close();
  }
});
it("paginates lightweight summaries on a compound index without duplicates or original hydration", async () => {
  const store = new ProjectStore(crypto.randomUUID());
  try {
    for (const id of ["a", "b", "c"])
      await store.save(
        createProject({ id, updatedAt: `2026-01-0${id.charCodeAt(0) - 96}T00:00:00.000Z` }),
      );
    const get = vi.spyOn(IDBObjectStore.prototype, "get"),
      first = await store.listPage({ limit: 2 }),
      second = await store.listPage({ limit: 2, before: first.before! });
    expect(first.projects.map((item) => item.id)).toEqual(["c", "b"]);
    expect(second.projects.map((item) => item.id)).toEqual(["a"]);
    expect(second.before).toBeNull();
    expect(first.projects.every((item) => item.pages.length === 1)).toBe(true);
    expect(get).not.toHaveBeenCalled();
    await expect(store.listPage({ limit: 0 })).rejects.toThrow("pagination");
  } finally {
    await store.close();
  }
});
it("stores bounded thumbnail blobs, rejects stale/deleted commits and purges page/project resources atomically", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    project = createProject({
      id: "p",
      pages: [createPage({ id: "first" }), createPage({ id: "second" })],
    });
  await store.save(project);
  const db = await openStudioDatabase(name);
  try {
    const infos = (await store.list())[0]!.pages;
    const thumbnail = {
      projectId: "p",
      pageId: "first",
      revision: infos[0]!.thumbnailRevision!,
      blob: new Blob(["encoded-webp"], { type: "image/webp" }),
      width: 80,
      height: 80,
      updatedAt: project.updatedAt,
    };
    expect(await store.saveThumbnail(thumbnail)).toBe(true);
    expect((await store.thumbnailInfo("p"))[0]!.bytes).toBe(12);
    expect(await store.thumbnails("p", ["first", "first", "missing"])).toHaveLength(1);
    expect((await store.usage("p")).bytes.thumbnails).toBeGreaterThan(12);
    expect(await store.saveThumbnail({ ...thumbnail, revision: "stale" })).toBe(false);
    for (const patch of [
      { width: 769 },
      { height: 0 },
      { width: 1.5 },
      { blob: new Blob([new Uint8Array(1024 * 1024 + 1)]) },
    ])
      await expect(store.saveThumbnail({ ...thumbnail, ...patch })).rejects.toThrow(
        "Invalid thumbnail",
      );
    await store.save({
      ...project,
      pages: [{ ...project.pages[0]!, background: "#000000" }, project.pages[1]!],
    });
    expect(await store.thumbnails("p")).toEqual([]);
    expect(await store.saveThumbnail(thumbnail)).toBe(false);
    await store.save({ ...project, pages: [project.pages[1]!] });
    expect(await db.count("thumbnails")).toBe(0);
    await store.history.ensure({ ...project, pages: [project.pages[1]!] }, "second");
    await store.remove("p");
    for (const table of [
      "projects",
      "assets",
      "thumbnails",
      "journalMeta",
      "journalBase",
      "journalEvents",
      "journalAssets",
    ] as const)
      expect(await db.count(table)).toBe(0);
    expect(await store.saveThumbnail(thumbnail)).toBe(false);
    expect(await store.thumbnails("p")).toEqual([]);
    expect(await store.thumbnailInfo("missing")).toEqual([]);
  } finally {
    db.close();
    await store.close();
  }
});

it("rolls back thumbnail and cascade mutations when a later write/delete fails", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    project = createProject({
      id: "rollback",
      assets: {
        photo: {
          id: "photo",
          name: "Original",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,AAAA",
        },
      },
    });
  await store.save(project);
  await store.history.ensure(project, project.pages[0]!.id);
  const db = await openStudioDatabase(name);
  try {
    const revision = (await store.list())[0]!.pages[0]!.thumbnailRevision!,
      thumbnail = {
        projectId: project.id,
        pageId: project.pages[0]!.id,
        revision,
        blob: new Blob(["first"], { type: "image/webp" }),
        width: 10,
        height: 10,
        updatedAt: project.updatedAt,
      };
    await store.saveThumbnail(thumbnail);
    const before = await store.usage(project.id),
      put = IDBObjectStore.prototype.put;
    const failure = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "projects") throw new Error("quota");
      return put.apply(this, args);
    });
    await expect(
      store.saveThumbnail({
        ...thumbnail,
        blob: new Blob(["replacement"], { type: "image/webp" }),
      }),
    ).rejects.toThrow("quota");
    failure.mockRestore();
    expect((await store.thumbnails(project.id))[0]!.blob.size).toBe(5);
    expect((await store.usage(project.id)).bytes).toEqual(before.bytes);
    const nativeDelete = IDBObjectStore.prototype.delete,
      remove = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["delete"]>
      ) {
        if (this.name === "thumbnails") throw new Error("delete failed");
        return nativeDelete.apply(this, args);
      });
    await expect(store.remove(project.id)).rejects.toThrow("delete failed");
    remove.mockRestore();
    expect(await store.isDeleted(project.id)).toBe(false);
    expect((await store.load(project.id)).id).toBe(project.id);
    expect(await db.count("thumbnails")).toBe(1);
    expect(await db.count("journalAssets")).toBe(1);
    expect(await db.count("assets")).toBe(1);
    await store.remove(project.id);
    expect(await db.count("thumbnails")).toBe(0);
    expect(await db.count("journalAssets")).toBe(0);
    expect(await db.count("assets")).toBe(0);
  } finally {
    db.close();
    await store.close();
  }
});

it("rolls back both a rename and its journal when appending fails, and retries a concurrent document change safely", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    other = new ProjectStore(name),
    project = createProject({ id: "atomic" });
  await store.save(project);
  await store.history.ensure(project, project.pages[0]!.id);
  const db = await openStudioDatabase(name);
  try {
    const nativePut = IDBObjectStore.prototype.put,
      fail = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "journalEvents") throw new Error("quota");
        return nativePut.apply(this, args);
      });
    await expect(store.rename(project.id, "Must rollback")).rejects.toThrow("quota");
    fail.mockRestore();
    expect((await store.load(project.id)).name).toBe(project.name);
    expect((await store.history.info(project.id))!.count).toBe(0);
    const load = store.load.bind(store);
    const read = vi.spyOn(store, "load").mockImplementationOnce(async (id) => {
      const stale = await load(id);
      await other.save({ ...stale, pages: [{ ...stale.pages[0]!, width: 777 }] });
      return stale;
    });
    await store.rename(project.id, "Safe rename");
    expect(read).toHaveBeenCalledTimes(2);
    expect(await store.load(project.id)).toMatchObject({
      name: "Safe rename",
      pages: [{ width: 777 }],
    });
    const replay = await store.history.replay(project.id);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.width).toBe(777);
    expect(replay.events).toHaveLength(1);
  } finally {
    db.close();
    await store.close();
    await other.close();
  }
});
