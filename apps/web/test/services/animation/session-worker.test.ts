import { afterEach, expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine, evaluateReplay } from "@musart/core";
import { AnimationSession } from "../../../src/services/animation/session";
import { HistoryStore } from "../../../src/services/history/store";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { TestJournalWorker } from "./journal/worker-fixture";
import { projectAt } from "../history/fixtures";

afterEach(() => vi.unstubAllGlobals());
async function fixture(reply?: ConstructorParameters<typeof TestJournalWorker>[0]) {
  const workers: TestJournalWorker[] = [];
  vi.stubGlobal(
    "Worker",
    class extends TestJournalWorker {
      constructor() {
        super(reply);
        workers.push(this);
      }
    },
  );
  const db = await openStudioDatabase(crypto.randomUUID()),
    store = new HistoryStore(async () => db),
    engine = new EditorEngine(projectAt()),
    session = new AnimationSession(engine),
    errors = vi.fn();
  session.attach(store, errors);
  return { db, store, engine, session, errors, workers };
}

it("uses summary capture and worker-only diffs while preserving durable controls and cleanup", async () => {
  const d = await fixture();
  try {
    const full = vi.spyOn(d.engine, "subscribeCommands"),
      append = vi.spyOn(d.store, "append"),
      ensure = vi.spyOn(d.store, "ensure");
    await d.session.flush();
    expect(full).not.toHaveBeenCalled();
    d.engine.transaction([
      { type: "updateLayers", ids: ["shape"], patch: { x: 12 } },
      { type: "updateLayers", ids: ["shape"], patch: { y: 8 } },
    ]);
    await d.session.flush();
    expect(d.session.read()).toMatchObject({ ready: true, events: 1, pending: 0, error: false });
    expect(append).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
    await d.session.stop();
    d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 20 } });
    await d.session.flush();
    expect(d.session.read().events).toBe(1);
    await d.session.start();
    await d.session.configure({ limit: 20 });
    const replay = await d.session.replay();
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(20);
    await d.session.clear();
    expect((await d.session.page()).entries).toHaveLength(0);
    const before = d.workers[0]!.messages.length;
    await d.session.dispose();
    d.engine.execute({ type: "renameProject", name: "Detached" });
    await d.session.flush();
    expect(d.workers[0]!.messages).toHaveLength(before);
    expect(d.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(d.errors).not.toHaveBeenCalled();
  } finally {
    await d.session.dispose();
    d.db.close();
  }
});

it("preserves accepted project snapshots through immediate switches and explicit disposal", async () => {
  const d = await fixture();
  try {
    await d.session.flush();
    d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 7 } });
    d.engine.load(createProject({ id: "second", pages: [createPage({ id: "second-page" })] }));
    d.engine.execute({ type: "renameProject", name: "Second title" });
    await d.session.dispose();
    expect(
      evaluateReplay(await d.store.replay("history-project"), 100000).pages[0]!.layers[0]!.x,
    ).toBe(7);
    expect(evaluateReplay(await d.store.replay("second"), 100000).name).toBe("Second title");
    expect(d.session.read()).toMatchObject({ events: 2, pending: 0, error: false });
  } finally {
    await d.session.dispose();
    d.db.close();
  }
});

it("reports real worker storage failures and permits the next captured commit to checkpoint recovery", async () => {
  let fail = true;
  const d = await fixture((reply, worker) => {
    const begin = worker.messages
      .slice()
      .reverse()
      .find((message) => message.type === "begin");
    if (fail && begin?.type === "begin" && begin.action.kind === "commit" && "result" in reply) {
      fail = false;
      worker.onmessage?.({
        data: { id: reply.id, error: { name: "QuotaExceededError", message: "Quota" } },
      } as MessageEvent);
      return false;
    }
    return true;
  });
  try {
    await d.session.flush();
    d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 4 } });
    await expect(d.session.flush()).rejects.toThrow("Quota");
    expect(d.session.read()).toMatchObject({ error: true, pending: 0 });
    expect(d.errors).toHaveBeenCalledOnce();
    d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 9 } });
    await d.session.flush();
    const replay = await d.session.replay();
    expect(replay.events.at(-1)!.after!.pages[0]!.layers[0]!.x).toBe(9);
    expect(d.session.read().error).toBe(false);
  } finally {
    await d.session.dispose();
    d.db.close();
  }
});

it("bounds outer admission and recovers newer changes after rejected captures without dropping accepted writes", async () => {
  const d = await fixture();
  try {
    await d.session.flush();
    for (let x = 1; x <= 130; x++)
      d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x } });
    expect(d.session.read().pending).toBe(128);
    expect(d.errors).toHaveBeenCalledTimes(2);
    await d.session.flush();
    expect((await d.store.info("history-project"))!.count).toBe(128);
    expect(d.session.read().error).toBe(true);
    d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 131 } });
    await d.session.flush();
    const replay = await d.session.replay();
    expect(replay.events.at(-1)!.after!.pages[0]!.layers[0]!.x).toBe(131);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(131);
    expect(d.session.read().error).toBe(false);
  } finally {
    await d.session.dispose();
    d.db.close();
  }
});
