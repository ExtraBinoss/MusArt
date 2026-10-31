import { afterEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createLayer, createProject, EditorEngine } from "@musart/core";
import { installAutosave, ProjectStore } from "../../../src/services/projects/storage";
import { projectPreferencesKey } from "../../../src/services/projects/preferences/schema";

vi.mock("idb", async () => {
  const original = await vi.importActual<typeof import("idb")>("idb");
  return { ...original, openDB: vi.fn(original.openDB) };
});
const stores: ProjectStore[] = [];
function store(name = crypto.randomUUID()) {
  const value = new ProjectStore(name);
  stores.push(value);
  return value;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const value of stores.splice(0)) await value.close();
});
describe("local project storage", () => {
  it("deletes layout preferences atomically with project retirement and rejects later writes", async () => {
    const name = crypto.randomUUID(),
      saved = store(name),
      id = "layout-project";
    await saved.preferences.update(id, { timelineZoom: 240, timelineHeight: 0.4 });
    await saved.remove(id);
    const inspection = await openDB(name);
    try {
      expect(await inspection.get("preferences", projectPreferencesKey(id))).toBeUndefined();
      expect(await inspection.get("preferences", `deleted-project:${id}`)).toBe("1");
      await expect(saved.preferences.update(id, { timelineZoom: 320 })).rejects.toMatchObject({
        code: "PROJECT_PREFERENCES_SAVE_FAILED",
        cause: { code: "PROJECT_DELETED" },
      });
    } finally {
      inspection.close();
    }
  });
  it("atomically saves documents and last-project preference, retaining or replacing thumbnails", async () => {
    const db = store();
    const project = createProject({ name: "Poster" });
    await db.save(project, "data:image/webp;base64,thumbnail");
    expect(await db.last()).toBe(project.id);
    expect(await db.load(project.id)).toEqual(project);
    expect(await db.list()).toEqual([
      {
        id: project.id,
        name: "Poster",
        mode: "static",
        pages: project.pages.map((page) => ({
          id: page.id,
          name: page.name,
          width: page.width,
          height: page.height,
          mode: "static",
          thumbnailRevision: expect.any(String),
        })),
        updatedAt: project.updatedAt,
        width: 1080,
        height: 1080,
        thumbnail: "data:image/webp;base64,thumbnail",
      },
    ]);
    await db.save({ ...project, name: "Renamed" });
    expect((await db.list())[0]?.thumbnail).toContain("thumbnail");
    await db.save(project, "replacement");
    expect((await db.list())[0]?.thumbnail).toBe("replacement");
    const backgroundCopy = { ...project, id: "background-copy" };
    await db.save(backgroundCopy, undefined, { remember: false });
    expect(await db.load(backgroundCopy.id)).toEqual(backgroundCopy);
    expect(await db.last()).toBe(project.id);
  });
  it("sorts recent projects deterministically and handles missing, removed and corrupt records", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const old = createProject({ id: "z", updatedAt: "2020-01-01T00:00:00.000Z" });
    const recent = createProject({ id: "b", updatedAt: "2026-10-27T00:00:00.000Z" });
    const tie = createProject({ id: "a", updatedAt: recent.updatedAt });
    for (const project of [old, recent, tie]) await db.save(project);
    expect((await db.list()).map((item) => item.id)).toEqual(["a", "b", "z"]);
    await db.remove("z");
    expect(await db.last()).toBe("a");
    await db.remove("a");
    expect(await db.last()).toBeUndefined();
    await expect(db.load("missing")).rejects.toThrow("introuvable");
    await expect(db.save({} as never)).rejects.toThrow();
    const connection = await openDB(name);
    await connection.put("projects", { id: "corrupt", project: { version: 0 } });
    await expect(db.load("corrupt")).rejects.toThrow("Version");
    connection.close();
  });
  it("retries failed database opening and can be reopened after explicit close", async () => {
    const db = store();
    vi.mocked(openDB).mockRejectedValueOnce(new Error("Blocked storage"));
    await expect(db.list()).rejects.toThrow("Blocked storage");
    expect(await db.list()).toEqual([]);
    await db.close();
    await db.close();
    expect(await db.last()).toBeUndefined();
  });
  it("uses the default database name when the platform supplies none", async () => {
    const db = new ProjectStore();
    stores.push(db);
    expect(await db.list()).toBeInstanceOf(Array);
  });
});
function assetProject() {
  const original = {
    id: "original",
    name: "Photo",
    mime: "image/png",
    width: 100,
    height: 50,
    dataUrl: "data:image/png;base64,original",
  };
  return { ...createProject(), assets: { original } };
}

function assetWriteCount(spy: { mock: { contexts: unknown[] } }) {
  return spy.mock.contexts.filter(
    (context) => context instanceof IDBObjectStore && context.name === "assets",
  ).length;
}
describe("separate immutable originals and lightweight manifests", () => {
  it.each(["__proto__", "prototype", "constructor"])(
    "rejects the reserved original ID %s before writing",
    async (id) => {
      const db = store(),
        asset = { ...assetProject().assets.original!, id },
        project = createProject({ assets: Object.fromEntries([[id, asset]]) }),
        writes = vi.spyOn(IDBObjectStore.prototype, "put");
      await expect(db.save(project)).rejects.toThrow("Identifiant réservé");
      expect(writes).not.toHaveBeenCalled();
      expect(await db.list()).toEqual([]);
    },
  );
  it("round-trips valid prototype-looking original and layer IDs as own properties", async () => {
    const db = store();
    const asset = { ...assetProject().assets.original!, id: "toString" };
    const project = createProject({ assets: Object.fromEntries([[asset.id, asset]]) });
    project.pages[0]!.layers.push(createLayer("image", { id: "valueOf", assetId: asset.id }));
    await db.save(project);
    const loaded = await db.load(project.id);
    expect(Object.hasOwn(loaded.assets, asset.id)).toBe(true);
    expect(Object.getPrototypeOf(loaded.assets)).toBe(Object.prototype);
    expect(loaded.assets[asset.id]).toEqual(asset);
    expect(loaded.pages[0]!.layers[0]!.assetId).toBe(asset.id);
    expect(loaded).toEqual(project);
    await db.saveCurrent(loaded);
    expect(await db.load(project.id)).toEqual(project);
  });
  it("writes original bytes once while repeated document saves only clone small manifests", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const project = assetProject();
    const puts = vi.spyOn(IDBObjectStore.prototype, "put");
    await db.save(project);
    await db.save({ ...project, name: "Moved layer" });
    expect(assetWriteCount(puts)).toBe(1);
    const connection = await openDB(name);
    const record = await connection.get("projects", project.id);
    expect(record.storageVersion).toBe(2);
    expect(record.project.assets.original).toEqual({
      id: "original",
      name: "Photo",
      mime: "image/png",
      width: 100,
      height: 50,
    });
    expect(JSON.stringify(record)).not.toContain("data:image/");
    expect(await connection.get("assets", [project.id, "original"])).toEqual({
      projectId: project.id,
      assetId: "original",
      dataUrl: project.assets.original!.dataUrl,
    });
    expect(await db.load(project.id)).toEqual({ ...project, name: "Moved layer" });
    await db.close();
    await db.save({ ...project, name: "Reopened" });
    expect(assetWriteCount(puts)).toBe(1);
    connection.close();
  });
  it("rewrites changed originals, updates metadata independently and deletes removed original records", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const project = assetProject();
    const puts = vi.spyOn(IDBObjectStore.prototype, "put");
    await db.save(project);
    project.assets.original!.name = "Renamed metadata";
    await db.save(project);
    expect(assetWriteCount(puts)).toBe(1);
    project.assets.original!.dataUrl = "data:image/png;base64,replacement";
    await db.save(project);
    expect(assetWriteCount(puts)).toBe(2);
    expect((await db.load(project.id)).assets.original!.name).toBe("Renamed metadata");
    expect((await db.load(project.id)).assets.original!.dataUrl).toContain("replacement");
    await db.save({ ...project, assets: {} });
    const connection = await openDB(name);
    expect(await connection.count("assets")).toBe(0);
    connection.close();
  });
  it("loads legacy v1 documents and converts them atomically on the next save", async () => {
    const name = crypto.randomUUID();
    const project = assetProject();
    const legacy = await openDB(name, 1, {
      upgrade(connection) {
        connection.createObjectStore("projects", { keyPath: "id" });
        connection.createObjectStore("preferences");
      },
    });
    await legacy.put("projects", { id: project.id, project, thumbnail: "legacy-preview" });
    await legacy.put("preferences", project.id, "last-project");
    legacy.close();
    const db = store(name);
    const loaded = await db.load(project.id);
    expect(loaded).toEqual(project);
    const connection = await openDB(name);
    expect(connection.version).toBe(7);
    expect(await connection.count("assets")).toBe(0);
    expect((await connection.get("projects", project.id)).storageVersion).toBeUndefined();
    await db.save(loaded);
    expect((await connection.get("projects", project.id)).storageVersion).toBe(2);
    expect(await connection.count("assets")).toBe(1);
    expect((await db.list())[0]?.thumbnail).toBe("legacy-preview");
    expect(await db.load(project.id)).toEqual(project);
    connection.close();
  });
  it("reports missing original records rather than opening a partially hydrated project", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const project = assetProject();
    await db.save(project);
    const connection = await openDB(name);
    await connection.delete("assets", [project.id, "original"]);
    await expect(db.load(project.id)).rejects.toThrow("Ressource locale manquante");
    connection.close();
  });
  it("purges only the deleted project's compound-key originals, even when asset IDs are shared", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const first = assetProject();
    const second = assetProject();
    await db.save(first);
    await db.save(second);
    const connection = await openDB(name);
    expect(await connection.count("assets")).toBe(2);
    await db.remove(first.id);
    expect(await connection.count("assets")).toBe(1);
    expect(await db.load(second.id)).toEqual(second);
    await db.remove(second.id);
    expect(await connection.count("assets")).toBe(0);
    expect(await db.last()).toBeUndefined();
    connection.close();
  });
  it("retains only one project's write cache and repopulates it when switching back", async () => {
    const db = store();
    const first = assetProject();
    const second = assetProject();
    const reads = vi.spyOn(IDBIndex.prototype, "getAll");
    const writes = vi.spyOn(IDBObjectStore.prototype, "put");
    await db.save(first);
    await db.save({ ...first, name: "First edit" });
    expect(reads).toHaveBeenCalledTimes(1);
    await db.save(second);
    await db.save({ ...first, name: "Switch back" });
    expect(reads).toHaveBeenCalledTimes(3);
    expect(assetWriteCount(writes)).toBe(2);
    await db.load(second.id);
    await db.save({ ...second, name: "Loaded edit" });
    expect(reads).toHaveBeenCalledTimes(3);
    expect(assetWriteCount(writes)).toBe(2);
  });
  it("rolls back originals and metadata together on write failure and retries the original on recovery", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const project = assetProject();
    await db.save(project);
    const changed = {
      ...project,
      name: "Changed",
      assets: {
        original: {
          ...project.assets.original!,
          kind: "image" as const,
          dataUrl: "data:image/png;base64,updated",
        },
      },
    };
    const originalPut = IDBObjectStore.prototype.put;
    const failure = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "projects") throw new DOMException("Quota reached", "QuotaExceededError");
      return originalPut.call(this, value, key);
    });
    await expect(db.save(changed)).rejects.toThrow("Quota reached");
    failure.mockRestore();
    const connection = await openDB(name);
    expect((await connection.get("assets", [project.id, "original"])).dataUrl).toBe(
      project.assets.original!.dataUrl,
    );
    expect((await db.load(project.id)).name).toBe(project.name);
    await db.save(changed);
    expect(await db.load(project.id)).toEqual(changed);
    connection.close();
  });
  it("rejects a valid document stored under an inconsistent project identity", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    await db.list();
    const connection = await openDB(name);
    const project = createProject();
    await connection.put("projects", { id: "wrong-key", project });
    await expect(db.load("wrong-key")).rejects.toThrow("incohérente");
    connection.close();
  });
});
describe("original revision cache validation", () => {
  it("invalidates cached originals after another session changes them, without re-reading on metadata-only edits", async () => {
    const name = crypto.randomUUID();
    const first = store(name);
    const second = store(name);
    const project = assetProject();
    const reads = vi.spyOn(IDBIndex.prototype, "getAll");
    await first.save(project);
    await first.save({ ...project, name: "Metadata only" });
    expect(reads).toHaveBeenCalledTimes(1);
    await second.save({
      ...project,
      assets: {
        original: {
          ...project.assets.original!,
          kind: "image" as const,
          dataUrl: "data:image/png;base64,second",
        },
      },
    });
    const final = { ...project, name: "First session commits its complete document" };
    await first.save(final);
    expect(reads).toHaveBeenCalledTimes(3);
    expect(await first.load(project.id)).toEqual(final);
    await first.save({ ...final, name: "Another transform" });
    expect(reads).toHaveBeenCalledTimes(3);
  });
  it("permanently rejects deleted identities across sessions instead of recreating from stale caches", async () => {
    const name = crypto.randomUUID();
    const first = store(name);
    const second = store(name);
    const project = assetProject();
    await first.save(project);
    await second.remove(project.id);
    await expect(second.save(project)).rejects.toThrow("deleted");
    await expect(first.save(project)).rejects.toThrow("deleted");
    await expect(first.load(project.id)).rejects.toThrow("introuvable");
    const connection = await openDB(name);
    expect(await connection.count("projects")).toBe(0);
    expect(await connection.count("assets")).toBe(0);
    expect(await first.isDeleted(project.id)).toBe(true);
    connection.close();
  });
  it("upgrades existing v2 manifests without revision tokens without rewriting their original bytes", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    const project = assetProject();
    await db.save(project);
    const connection = await openDB(name);
    const record = await connection.get("projects", project.id);
    delete record.assetsRevision;
    await connection.put("projects", record);
    await db.close();
    const loaded = await db.load(project.id);
    const writes = vi.spyOn(IDBObjectStore.prototype, "put");
    await db.save(loaded);
    expect(assetWriteCount(writes)).toBe(0);
    expect((await connection.get("projects", project.id)).assetsRevision).toBe("assets:2");
    connection.close();
  });
  it("rejects corrupted revision counters atomically before publishing a new manifest", async () => {
    const name = crypto.randomUUID();
    const db = store(name);
    await db.list();
    const connection = await openDB(name);
    await connection.put("preferences", "corrupt", "asset-revision-sequence");
    await expect(db.save(assetProject())).rejects.toThrow("Compteur");
    expect(await connection.count("assets")).toBe(0);
    expect(await connection.count("projects")).toBe(0);
    connection.close();
  });
});
describe("autosave scheduling", () => {
  it("debounces document commits, skips session-only selection and flushes on disposal", async () => {
    vi.useFakeTimers();
    const engine = new EditorEngine();
    const save = vi.fn(async (_project: ReturnType<typeof createProject>) => {});
    const onError = vi.fn();
    const controller = installAutosave(engine, { save }, onError, 50);
    engine.execute({ type: "addLayers", layers: [createLayer("rectangle", { id: "rect" })] });
    engine.select([]);
    engine.select(["rect"]);
    engine.execute({ type: "renameProject", name: "Latest" });
    await vi.advanceTimersByTimeAsync(49);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ name: "Latest" });
    engine.select([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    engine.execute({ type: "renameProject", name: "On close" });
    await controller.dispose();
    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    engine.execute({ type: "renameProject", name: "Unsubscribed" });
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("serializes writes, reports failures and recovers for later commits", async () => {
    vi.useFakeTimers();
    const engine = new EditorEngine();
    const failures = vi.fn();
    const save = vi
      .fn<(_: ReturnType<typeof createProject>) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Quota reached"))
      .mockResolvedValue(undefined);
    const controller = installAutosave(engine, { save }, failures);
    await controller.flush();
    expect(save).not.toHaveBeenCalled();
    engine.execute({ type: "renameProject", name: "First" });
    await controller.flush();
    expect(failures).toHaveBeenCalledWith(expect.objectContaining({ message: "Quota reached" }));
    engine.execute({ type: "renameProject", name: "Second" });
    await controller.flush();
    expect(save).toHaveBeenCalledTimes(2);
    await controller.dispose();
  });
});

it("bounded favorite lookup returns only selected project summaries without changing the active project", async () => {
  const store = new ProjectStore(crypto.randomUUID());
  try {
    const first = createProject({ name: "Selected" }),
      second = createProject({ name: "Other" });
    await store.save(first);
    await store.save(second);
    const before = await store.last();
    const page = await store.listPage({ ids: [first.id, "missing", first.id], limit: 3 });
    expect(page.projects.map((project) => project.id)).toEqual([first.id]);
    expect(page.before).toBeNull();
    expect(await store.last()).toBe(before);
    await expect(store.listPage({ ids: [first.id, second.id], limit: 1 })).rejects.toThrow(
      "metadata selection",
    );
  } finally {
    await store.close();
  }
});
