import { describe, expect, it, vi } from "vitest";
import { evaluateReplay, stateFromProject } from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
import { HistoryStore } from "../../../src/services/history/store";
import { fixture, projectAt, eventAt, seed } from "./fixtures";

describe("separate paginated history storage", () => {
  it("paginates newest-first without duplicates, bounds page size and restores original commit order", async () => {
    const { db, store } = await fixture();
    try {
      await seed(store, 105);
      const first = await store.page("history-project", undefined, 1000);
      expect(first.entries).toHaveLength(100);
      expect(first.before).toBe(5);
      expect(first.entries[0]!.sequence).toBe(104);
      const second = await store.page("history-project", first.before!);
      expect(second.entries.map((item) => item.sequence)).toEqual([4, 3, 2, 1, 0]);
      expect(second.before).toBeNull();
      expect((await store.page("history-project", 0)).entries).toEqual([]);
      expect((await store.page("missing")).total).toBe(0);
      await expect(store.page("history-project", NaN)).rejects.toThrow("pagination");
      const replay = await store.replay("history-project");
      expect(replay.events).toHaveLength(105);
      expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(105);
      expect((await store.info("history-project"))!.lastFingerprint).toHaveLength(64);
    } finally {
      db.close();
    }
  });
  it("reconciles actual metadata changes even when a restored timestamp is identical", async () => {
    const { db, store } = await fixture();
    try {
      const changed = projectAt();
      changed.pages[0]!.width = 900;
      await store.ensure(changed, "page");
      const replay = await store.replay(changed.id);
      expect(evaluateReplay(replay, replay.duration).pages[0]!.width).toBe(900);
      expect((await store.info(changed.id))!.count).toBe(1);
      await store.ensure(changed, "page");
      expect((await store.info(changed.id))!.count).toBe(1);
    } finally {
      db.close();
    }
  });
  it("atomically rejects conflicting original IDs and invalid sequence/project identities", async () => {
    const { db, store } = await fixture();
    const asset = {
      id: "photo",
      name: "Photo",
      width: 1,
      height: 1,
      mime: "image/png",
      dataUrl: "data:image/png;base64,one",
    };
    try {
      await store.append("history-project", eventAt(1), { photo: asset }, "first");
      await expect(
        store.append(
          "history-project",
          eventAt(2),
          { photo: { ...asset, dataUrl: "data:image/png;base64,two" } },
          "second",
        ),
      ).rejects.toThrow("cannot be replaced");
      expect((await store.info("history-project"))!.count).toBe(1);
      expect((await store.page("history-project")).entries).toHaveLength(1);
      await expect(
        store.append("history-project", { ...eventAt(2), projectId: "wrong" }, {}, "bad"),
      ).rejects.toThrow("sequence or project");
      await expect(store.append("missing", eventAt(1), {}, "bad")).rejects.toThrow("initialized");
      await expect(store.configure("missing", { limit: 100 })).rejects.toThrow("initialized");
      await expect(store.configure("history-project", { limit: 0 })).rejects.toThrow("limit");
      await expect(
        store.configure("history-project", { enabled: 0 } as unknown as { enabled: boolean }),
      ).rejects.toThrow("boolean");
      await store.configure("history-project", { enabled: false });
      await store.append("history-project", eventAt(2), {}, "disabled");
      expect((await store.info("history-project"))!.count).toBe(1);
    } finally {
      db.close();
    }
  });
  it("uses a checkpoint when two writers diverge and keeps both final commits replayable", async () => {
    const { db, store } = await fixture();
    try {
      await seed(store, 1);
      const other = projectAt(2);
      other.pages[0]!.layers[0]!.fill = "#ff0000";
      await store.append(other.id, eventAt(2), {}, other.updatedAt, 100, {
        expectedNext: 0,
        current: stateFromProject(other),
      });
      const page = await store.page(other.id);
      expect(page.entries[0]!.event.after).toBeDefined();
      expect(page.entries[0]!.event.delta).toEqual([]);
      const replay = await store.replay(other.id);
      expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.fill).toBe("#ff0000");
    } finally {
      db.close();
    }
  });
  it("loads a project and its history header without scanning historical entries", async () => {
    const name = crypto.randomUUID(),
      projects = new ProjectStore(name);
    try {
      const initial = projectAt();
      await projects.save(initial);
      await projects.history.ensure(initial, "page");
      await seed(projects.history, 300);
      await projects.save(projectAt(300));
      const reads = vi.spyOn(IDBObjectStore.prototype, "openCursor");
      const all = vi.spyOn(IDBObjectStore.prototype, "getAll");
      expect((await projects.load(initial.id)).pages[0]!.layers[0]!.x).toBe(300);
      await projects.history.ensure(projectAt(300), "page");
      expect(
        reads.mock.contexts.filter((store) => (store as IDBObjectStore).name === "journalEvents"),
      ).toHaveLength(0);
      expect(
        all.mock.contexts.filter((store) => (store as IDBObjectStore).name === "journalEvents"),
      ).toHaveLength(0);
      await projects.remove(initial.id);
      expect(await projects.history.info(initial.id)).toBeUndefined();
    } finally {
      await projects.close();
    }
  });
  it("reports incomplete/cancelled replays instead of silently dropping frames", async () => {
    const { db, store } = await fixture();
    try {
      await seed(store, 2);
      const controller = new AbortController();
      controller.abort();
      await expect(store.replay("history-project", controller.signal)).rejects.toThrow();
      await db.delete("journalEvents", ["history-project", 0]);
      await expect(store.replay("history-project")).rejects.toThrow("incomplete");
      await expect(store.replay("missing")).rejects.toThrow("initialized");
      const invalid = new HistoryStore(async () => {
        throw new Error("storage blocked");
      });
      await expect(invalid.info("history-project")).rejects.toThrow("storage blocked");
    } finally {
      db.close();
    }
  });
});

it("rejects an interior replay gap even when its corrupted count matches the remaining rows", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 3);
    await db.delete("journalEvents", ["history-project", 1]);
    const meta = (await store.info("history-project"))!;
    await db.put("journalMeta", { ...meta, count: 2 });
    await expect(store.replay("history-project")).rejects.toThrow("incomplete");
  } finally {
    db.close();
  }
});

it("clears all history atomically to the current base and original pool, retaining user settings", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 5);
    await store.configure("history-project", { limit: 20, enabled: false });
    const project = projectAt(5);
    project.assets.new = {
      id: "new",
      name: "Current",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
    };
    await db.put("journalAssets", {
      projectId: project.id,
      assetId: "unused",
      asset: { ...project.assets.new, id: "unused" },
    });
    const meta = await store.clear(project, "page");
    expect(meta).toMatchObject({
      first: 0,
      next: 0,
      count: 0,
      limit: 20,
      enabled: false,
      lastAt: 0,
      bytes: { events: 0 },
    });
    expect(await db.count("journalEvents")).toBe(0);
    expect((await db.getAll("journalAssets")).map((record) => record.assetId)).toEqual(["new"]);
    const replay = await store.replay(project.id);
    expect(replay.events).toEqual([]);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(5);
    await expect(store.clear(project, "missing")).rejects.toThrow("page");
  } finally {
    db.close();
  }
});
it("rolls back history deletion if creating the replacement base fails", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 2);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "journalBase") throw new Error("quota");
      return put.apply(this, args);
    });
    await expect(store.clear(projectAt(2), "page")).rejects.toThrow("quota");
    expect((await store.info("history-project"))!.count).toBe(2);
    expect(await db.count("journalEvents")).toBe(2);
  } finally {
    db.close();
  }
});
