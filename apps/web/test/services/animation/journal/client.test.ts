import { expect, it, vi } from "vitest";
import {
  EditorEngine,
  evaluateReplay,
  observeReplayTransitions,
  stateFromProject,
  type ReplayTransition,
} from "@musart/core";
import { JournalClient } from "../../../../src/services/animation/journal/client";
import { JournalProcessor } from "../../../../src/services/animation/journal/processor";
import { HistoryStore } from "../../../../src/services/history/store";
import type { HistoryMetadata } from "../../../../src/services/history/model";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { projectAt } from "../../history/fixtures";
import { TestJournalWorker } from "./worker-fixture";

async function fixture(reply?: ConstructorParameters<typeof TestJournalWorker>[0]) {
  const db = await openStudioDatabase(crypto.randomUUID()),
    store = new HistoryStore(async () => db),
    engine = new EditorEngine(projectAt());
  const workers: TestJournalWorker[] = [],
    client = new JournalClient(store, engine, {
      yieldTask: async () => {},
      worker: () => {
        const worker = new TestJournalWorker(reply);
        workers.push(worker);
        return worker;
      },
    });
  const transitions: ReplayTransition[] = [],
    stop = observeReplayTransitions(engine, {
      onTransition: (transition) => transitions.push(transition),
    });
  return {
    db,
    store,
    engine,
    client,
    workers,
    stop,
    transitions,
    edit(x: number) {
      engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x } });
      return transitions.at(-1)!;
    },
  };
}

it("persists metadata in FIFO, preserves undo/redo and transfers unchanged originals only initially", async () => {
  const d = await fixture();
  try {
    const photo = {
      id: "photo",
      name: "Photo",
      mime: "image/png",
      width: 10,
      height: 10,
      dataUrl: "data:image/png;base64," + "a".repeat(40000),
    };
    d.engine.execute({ type: "addAssets", assets: [photo] });
    await d.client.ensure(d.engine.getSnapshot());
    const initialParts = d.workers[0]!.messages.length;
    const first = d.client.commit(d.edit(10)),
      second = d.client.commit(d.edit(20));
    await first;
    await second;
    expect((await d.store.replay("history-project")).events).toHaveLength(2);
    expect(JSON.stringify(d.workers[0]!.messages.slice(initialParts))).not.toContain(
      "data:image/png",
    );
    d.engine.undo();
    await d.client.commit(d.transitions.at(-1)!);
    d.engine.redo();
    await d.client.commit(d.transitions.at(-1)!);
    expect(
      evaluateReplay(await d.store.replay("history-project"), 100000).pages[0]!.layers[0]!.x,
    ).toBe(20);
    expect((await d.store.page("history-project")).entries.at(-1)!.event.commands).toEqual([
      { type: "updateLayers", summary: true },
    ]);
  } finally {
    d.stop();
    await d.client.dispose();
    d.db.close();
  }
});

it("orders clear, stop and resume around commits without dropping paused originals", async () => {
  const d = await fixture();
  try {
    await d.client.ensure(d.engine.getSnapshot());
    await d.client.commit(d.edit(1));
    const cleared = d.client.clear(d.engine.getSnapshot()),
      next = d.client.commit(d.edit(2));
    await cleared;
    await next;
    expect((await d.store.info("history-project"))!.count).toBe(1);
    await d.client.configure(d.engine.getSnapshot(), { enabled: false });
    await d.client.commit(d.edit(20));
    expect((await d.store.info("history-project"))!.count).toBe(1);
    await d.client.configure(d.engine.getSnapshot(), { enabled: true, limit: 50 });
    await d.client.commit(d.edit(30));
    const replay = await d.store.replay("history-project");
    expect(replay.events[1]!.after!.pages[0]!.layers[0]!.x).toBe(20);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(30);
    expect((await d.store.info("history-project"))!.limit).toBe(50);
  } finally {
    d.stop();
    await d.client.dispose();
    d.db.close();
  }
});

it("retries a lost commit ACK exactly once without adopting a later remote cursor", async () => {
  let lose = true,
    remote!: HistoryStore;
  const d = await fixture(async (reply, worker) => {
    const begin = worker.messages
      .slice()
      .reverse()
      .find((message) => message.type === "begin");
    if (lose && begin?.type === "begin" && begin.action.kind === "commit" && "result" in reply) {
      lose = false;
      await remote.append(
        "history-project",
        {
          projectId: "history-project",
          pageId: "page",
          at: 20,
          kind: "load",
          commands: [],
          delta: [],
          after: stateFromProject(projectAt(90)),
        },
        {},
        projectAt(90).updatedAt,
      );
      setTimeout(() => worker.crash(), 0);
      return false;
    }
    return true;
  });
  remote = d.store;
  try {
    await d.client.ensure(d.engine.getSnapshot());
    const meta = await d.client.commit(d.edit(1));
    expect(meta.count).toBe(2);
    expect(d.workers).toHaveLength(2);
    const actions = d.workers
      .flatMap((worker) => worker.messages)
      .filter((message) => message.type === "begin" && message.action.kind === "commit");
    expect(actions).toHaveLength(2);
    const one = actions[0]!,
      two = actions[1]!;
    if (
      one.type !== "begin" ||
      two.type !== "begin" ||
      one.action.kind !== "commit" ||
      two.action.kind !== "commit"
    )
      throw Error("Expected commits");
    expect(two.action.operation).toEqual({ ...one.action.operation, retry: true });
    await d.client.commit(d.edit(2));
    const replay = await d.store.replay("history-project");
    expect(replay.events).toHaveLength(3);
    expect(replay.events[2]!.after!.pages[0]!.layers[0]!.x).toBe(2);
  } finally {
    d.stop();
    await d.client.dispose();
    d.db.close();
  }
});

it("falls back to the same exact processor after worker startup failures and closes it", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    store = new HistoryStore(async () => db),
    engine = new EditorEngine(projectAt());
  let processor!: JournalProcessor;
  const fallback = vi.fn(async (name: string) => {
    processor = new JournalProcessor(name);
    return processor;
  });
  const worker = vi.fn(() => {
      throw Error("CSP");
    }),
    client = new JournalClient(store, engine, { worker, fallback });
  try {
    await client.ensure(engine.getSnapshot());
    expect(worker).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledOnce();
    const disposed = vi.spyOn(processor, "dispose");
    await client.clear(engine.getSnapshot());
    await client.dispose();
    await client.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    await expect(client.ensure(engine.getSnapshot())).rejects.toThrow("disposed");
  } finally {
    await client.dispose();
    db.close();
  }
});

it("bounds admission, captures mutable input synchronously and drains all accepted writes on dispose", async () => {
  const d = await fixture();
  try {
    const snapshot = structuredClone(d.engine.getSnapshot()),
      accepted = d.client.ensure(snapshot);
    snapshot.project.name = "Too late";
    await accepted;
    expect((await d.db.get("journalBase", "history-project"))!.state.name).toBe("Timeline");
    const jobs = Array.from({ length: 128 }, () =>
      d.client.configure(d.engine.getSnapshot(), { limit: 100 }),
    );
    await expect(d.client.clear(d.engine.getSnapshot())).rejects.toThrow("full");
    const disposing = d.client.dispose();
    await Promise.all(jobs);
    await disposing;
    expect((await d.store.info("history-project"))!.limit).toBe(100);
    expect(d.workers[0]!.terminate).toHaveBeenCalledOnce();
  } finally {
    d.stop();
    await d.client.dispose();
    d.db.close();
  }
});

it("rejects an uncertain initialization ACK instead of reapplying an old snapshot over a foreign commit", async () => {
  let lose = true,
    remote!: HistoryStore;
  const d = await fixture(async (reply, worker) => {
    if (lose && "result" in reply) {
      lose = false;
      await remote.append(
        "history-project",
        {
          projectId: "history-project",
          pageId: "page",
          at: 1,
          kind: "load",
          commands: [],
          delta: [],
          after: stateFromProject(projectAt(99)),
        },
        {},
        projectAt(99).updatedAt,
      );
      setTimeout(() => worker.crash(), 0);
      return false;
    }
    return true;
  });
  remote = d.store;
  try {
    await expect(d.client.ensure(d.engine.getSnapshot())).rejects.toMatchObject({
      code: "UNCERTAIN_JOURNAL_INITIALIZATION",
    });
    const replay = await d.store.replay("history-project");
    expect(replay.events).toHaveLength(1);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(99);
    expect(d.workers).toHaveLength(1);
    await d.client.commit(d.edit(2));
    expect((await d.store.page("history-project")).total).toBe(2);
  } finally {
    d.stop();
    await d.client.dispose();
    d.db.close();
  }
});

it("keeps missing originals and state in recovery across a metadata-only configuration", async () => {
  const d = await fixture();
  try {
    await d.client.ensure(d.engine.getSnapshot());
    vi.spyOn(HistoryStore.prototype, "appendOperation").mockRejectedValueOnce(new Error("quota"));
    d.engine.execute({
      type: "addAssets",
      assets: [
        {
          id: "unsaved",
          name: "Unsaved original",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,AAAA",
        },
      ],
    });
    await expect(d.client.commit(d.transitions.at(-1)!)).rejects.toThrow("quota");
    expect(await d.db.get("journalAssets", ["history-project", "unsaved"])).toBeUndefined();
    await d.client.configure(d.engine.getSnapshot(), { limit: 50 });
    await d.client.commit(d.edit(8));
    const replay = await d.store.replay("history-project");
    expect(replay.assets.unsaved!.dataUrl).toBe("data:image/png;base64,AAAA");
    expect(replay.events.at(-1)!.after!.assetIds).toContain("unsaved");
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(8);
  } finally {
    d.stop();
    await d.client.dispose();
    d.db.close();
  }
});

it("rejects a corrupted durable header through the default local fallback and still disposes after failure", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    store = new HistoryStore(async () => db),
    engine = new EditorEngine(projectAt());
  await store.ensure(engine.getSnapshot().project, "page");
  const meta = (await store.info("history-project"))!;
  await db.put("journalMeta", { ...meta, version: 999 } as unknown as HistoryMetadata);
  const client = new JournalClient(store, engine, {
    worker: () => {
      throw new Error("Worker blocked");
    },
  });
  try {
    await expect(client.ensure(engine.getSnapshot())).rejects.toThrow("Malformed journal");
    expect((await store.info("history-project"))!.version).toBe(999);
    await expect(client.dispose()).rejects.toThrow("Malformed journal");
    await expect(client.dispose()).rejects.toThrow("Malformed journal");
    await expect(client.ensure(engine.getSnapshot())).rejects.toThrow("disposed");
  } finally {
    await client.dispose().catch(() => {});
    db.close();
  }
});
