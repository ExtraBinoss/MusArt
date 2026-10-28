import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { clearThumbnailRevisionCache } from "../../../src/services/projects/thumbnails/revision";
import { ThumbnailPipeline } from "../../../src/services/projects/thumbnails/queue";
import { ThumbnailRenderer } from "../../../src/services/projects/thumbnails/renderer";
import { ProjectStore } from "../../../src/services/projects/storage";
import { openStudioDatabase } from "../../../src/services/projects/database";
import {
  StaleProjectWriteError,
  readProjectWriteRevision,
} from "../../../src/services/projects/writes/revision";
const stores: ProjectStore[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(stores.splice(0).map((store) => store.close()));
});
function fixture(separate: boolean) {
  const name = crypto.randomUUID(),
    first = new ProjectStore(name),
    second = separate ? new ProjectStore(name) : first;
  stores.push(first);
  if (first !== second) stores.push(second);
  return {
    name,
    first,
    second,
    base: createProject({ id: "race-project", pages: [createPage({ id: "race-page" })] }),
  };
}
function hashGate() {
  let release!: () => void, start!: () => void;
  const resume = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      start = resolve;
    });
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, bytes) => {
    if (new TextDecoder().decode(bytes as ArrayBuffer).includes('"background":"#112233"')) {
      start();
      return resume.then(() => digest(algorithm, bytes));
    }
    return digest(algorithm, bytes);
  });
  return { started, release };
}
it("rejects a load completed after close without readopting its editor baseline", async () => {
  const d = fixture(false);
  await d.first.save(d.base);
  let closing: Promise<void> | undefined;
  const native = IDBObjectStore.prototype.get,
    get = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["get"]>
    ) {
      const request = native.apply(this, args);
      if (this.name === "projects")
        request.addEventListener(
          "success",
          () => {
            closing ??= d.first.close();
          },
          { once: true },
        );
      return request;
    });
  await expect(d.first.load(d.base.id)).rejects.toMatchObject({ name: "AbortError" });
  await closing;
  get.mockRestore();
  await expect(d.first.saveCurrent(d.base)).rejects.toBeInstanceOf(StaleProjectWriteError);
});
it("does not readopt a committed rename header after its store generation closes", async () => {
  const d = fixture(false);
  await d.first.save(d.base);
  let closing: Promise<void> | undefined;
  const native = IDBObjectStore.prototype.put,
    put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const request = native.apply(this, args);
      if (this.name === "projects")
        request.addEventListener(
          "success",
          () => {
            closing ??= d.first.close();
          },
          { once: true },
        );
      return request;
    });
  await expect(d.first.rename(d.base.id, "Committed before close")).resolves.toBeUndefined();
  await closing;
  put.mockRestore();
  await expect(d.first.saveCurrent(d.base)).rejects.toBeInstanceOf(StaleProjectWriteError);
  expect((await d.first.load(d.base.id)).name).toBe("Committed before close");
});
it.each(["save", "thumbnail"])(
  "closing during original preparation cannot recreate a hash worker (%s)",
  async (operation) => {
    const d = fixture(false),
      source = "data:image/png;base64,QQ==";
    clearThumbnailRevisionCache();
    const project = createProject({
      assets: {
        photo: {
          id: "photo",
          name: "Photo",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: source,
        },
      },
      pages: [createPage({ layers: [createLayer("image", { assetId: "photo" })] })],
    });
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        started = resolve;
      });
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
      if (new TextDecoder().decode(data as ArrayBuffer) === source) {
        started();
        await gate;
      }
      return nativeDigest(algorithm, data);
    });
    const worker = vi.fn(function () {
      throw new Error("Worker created after close");
    });
    vi.stubGlobal("Worker", worker);
    const pending =
      operation === "save"
        ? d.first.save(project)
        : d.first.thumbnailRevision(project.pages[0]!, project.assets);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await ready;
    await d.first.close();
    release();
    await rejected;
    expect(worker).not.toHaveBeenCalled();
    vi.stubGlobal("Worker", undefined);
    await d.first.save(d.base);
    expect((await d.first.load(d.base.id)).id).toBe(d.base.id);
  },
);
it.each([false, true])(
  "rejects an old hash result after a newer save commits (separate instances: %s)",
  async (separate) => {
    const d = fixture(separate);
    await d.first.save(d.base);
    const old = {
        ...d.base,
        name: "Old A",
        pages: [{ ...d.base.pages[0]!, background: "#112233" }],
      },
      latest = {
        ...d.base,
        name: "New B",
        pages: [{ ...d.base.pages[0]!, background: "#445566" }],
      },
      gate = hashGate();
    const pending = d.first.save(old),
      rejected = expect(pending).rejects.toBeInstanceOf(StaleProjectWriteError);
    await gate.started;
    await d.second.save(latest);
    gate.release();
    await rejected;
    expect(await d.first.load(d.base.id)).toEqual(latest);
    const sequential = {
      ...latest,
      updatedAt: "1970-01-01T00:00:00.000Z",
      name: "Sequential undo/import",
    };
    await d.first.save(sequential);
    expect(await d.first.load(d.base.id)).toEqual(sequential);
  },
);
it("snapshots a mutable caller before the hash await rather than persisting mixed paint/revision data", async () => {
  const d = fixture(false),
    input = {
      ...d.base,
      name: "Original",
      pages: [{ ...d.base.pages[0]!, background: "#112233" }],
    },
    before = structuredClone(input),
    gate = hashGate();
  const saving = d.first.save(input);
  await gate.started;
  input.name = "Mutated after save call";
  input.pages[0]!.background = "#445566";
  input.pages[0]!.width = -1;
  gate.release();
  await saving;
  expect(await d.first.load(before.id)).toEqual(before);
});

it("persists the captured certified publication when the engine advances during hashing", async () => {
  const d = fixture(false),
    engine = new EditorEngine({
      ...d.base,
      pages: [{ ...d.base.pages[0]!, background: "#112233" }],
    }),
    before = engine.getSnapshot().project,
    gate = hashGate();
  const saving = d.first.save(before);
  await gate.started;
  engine.execute({ type: "updatePage", patch: { width: before.pages[0]!.width + 100 } });
  gate.release();
  await saving;
  expect(await d.first.load(before.id)).toEqual(before);
  expect(engine.getSnapshot().project.pages[0]!.width).toBe(before.pages[0]!.width + 100);
});

it("still validates an external frozen project before opening any storage write", async () => {
  const d = fixture(false),
    external = Object.freeze({
      ...d.base,
      pages: [Object.freeze({ ...d.base.pages[0]!, width: -1 })],
    });
  await expect(d.first.save(external)).rejects.toThrow();
  expect(await d.first.list()).toEqual([]);
});
it("renames advance the same revision and cannot be overwritten by a previously hashing save", async () => {
  const d = fixture(true);
  await d.first.save(d.base);
  const gate = hashGate(),
    pending = d.first.save({ ...d.base, pages: [{ ...d.base.pages[0]!, background: "#112233" }] }),
    rejected = expect(pending).rejects.toBeInstanceOf(StaleProjectWriteError);
  await gate.started;
  await d.second.rename(d.base.id, "Renamed B");
  gate.release();
  await rejected;
  expect((await d.first.load(d.base.id)).name).toBe("Renamed B");
});
it("rolls a renewed revision back with the payload when a later preference write fails", async () => {
  const d = fixture(false);
  await d.first.save(d.base);
  const db = await openStudioDatabase(d.name),
    read = () => readProjectWriteRevision(db.transaction("preferences").store, d.base.id),
    before = await read();
  const put = IDBObjectStore.prototype.put;
  const fail = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    if (this.name === "preferences" && args[1] === "last-project")
      throw Error("Preference write failed");
    return put.apply(this, args);
  });
  try {
    await expect(d.first.save({ ...d.base, name: "Must rollback" })).rejects.toThrow(
      "Preference write failed",
    );
    fail.mockRestore();
    expect(await read()).toBe(before);
    expect(await d.first.load(d.base.id)).toEqual(d.base);
    await d.first.save({ ...d.base, name: "Retry succeeds" });
    expect(await read()).not.toBe(before);
  } finally {
    fail.mockRestore();
    db.close();
  }
});
it("guarded editor saves reject a stale loaded session, while an explicit replacement refreshes its baseline", async () => {
  const d = fixture(true);
  await d.first.save(d.base);
  const old = await d.first.load(d.base.id);
  await d.second.save({ ...d.base, name: "Other session" });
  await expect(d.first.saveCurrent({ ...old, name: "Stale editor" })).rejects.toBeInstanceOf(
    StaleProjectWriteError,
  );
  await d.first.save({ ...old, name: "Explicit replacement" });
  await d.first.saveCurrent({ ...old, name: "Editor after explicit replacement" });
  expect((await d.second.load(old.id)).name).toBe("Editor after explicit replacement");
  await d.first.close();
  await expect(d.first.saveCurrent(old)).rejects.toBeInstanceOf(StaleProjectWriteError);
  const reopened = await d.first.load(old.id);
  await d.first.saveCurrent({ ...reopened, name: "Reopened safely" });
});
it("guarded unknown projects can create only absent records, including legacy records without tokens", async () => {
  const d = fixture(true);
  await d.first.saveCurrent(d.base);
  const db = await openStudioDatabase(d.name);
  try {
    const legacy = { ...d.base, id: "legacy-project" };
    await db.put("projects", { id: legacy.id, project: legacy });
    await expect(d.second.saveCurrent(legacy)).rejects.toBeInstanceOf(StaleProjectWriteError);
    await d.second.load(legacy.id);
    await d.second.saveCurrent({ ...legacy, name: "Loaded legacy" });
    for (let index = 0; index < 128; index++)
      await d.first.saveCurrent({ ...d.base, id: `other-${index}` });
    await expect(d.first.saveCurrent(d.base)).rejects.toBeInstanceOf(StaleProjectWriteError);
    expect((await d.second.load(d.base.id)).name).toBe(d.base.name);
  } finally {
    db.close();
  }
});

it("background thumbnail loads and utility reads cannot adopt a newer editor baseline", async () => {
  const d = fixture(true);
  await d.first.save(d.base);
  const old = await d.first.load(d.base.id);
  await d.second.save({ ...d.base, name: "New remote state" });
  await d.first.load(old.id, { observe: false });
  await expect(d.first.saveCurrent(old)).rejects.toBeInstanceOf(StaleProjectWriteError);
  const renderer = new ThumbnailRenderer(async () => {
    throw Error("Unexpected GPU");
  });
  vi.spyOn(renderer, "render").mockResolvedValue({
    blob: new Blob(["test"]),
    width: 96,
    height: 96,
  });
  const pipeline = new ThumbnailPipeline(d.first, {
    renderer,
    activity: { busy: () => false, subscribe: () => () => {}, dispose: () => {} },
  });
  try {
    pipeline.request(old.id);
    await pipeline.flush();
    await expect(d.first.saveCurrent(old)).rejects.toBeInstanceOf(StaleProjectWriteError);
    expect((await d.second.load(old.id)).name).toBe("New remote state");
  } finally {
    await pipeline.dispose();
  }
});
