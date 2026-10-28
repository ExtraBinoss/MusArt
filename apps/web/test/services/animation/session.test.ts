import { describe, it, expect, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine, evaluateReplay } from "@musart/core";
import { AnimationSession, getAnimationSession } from "../../../src/services/animation/session";
import { HistoryStore } from "../../../src/services/history/store";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { projectAt } from "../history/fixtures";
import { getCanonicalPresentation } from "../../../src/state/session/canonical-presentation";
async function fixture() {
  const db = await openStudioDatabase(crypto.randomUUID()),
    store = new HistoryStore(async () => db),
    engine = new EditorEngine(projectAt()),
    session = new AnimationSession(engine),
    errors = vi.fn();
  return {
    db,
    store,
    engine,
    session,
    errors,
    attach: async () => {
      session.attach(store, errors);
      await session.flush();
    },
  };
}
const original = {
  id: "photo",
  name: "Photo",
  mime: "image/png",
  width: 10,
  height: 10,
  dataUrl: "data:image/png;base64,AAAA",
};
it("keeps heavy journal preparation behind the actual current canonical draw", async () => {
  const d = await fixture();
  const callbacks: FrameRequestCallback[] = [];
  const port = getCanonicalPresentation(d.engine),
    publisher = port.acquire();
  try {
    await d.attach();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const append = vi.spyOn(d.store, "append");
    d.engine.execute({ type: "renameProject", name: "Waiting for pixels" });
    const snapshot = d.engine.getSnapshot(),
      ticket = publisher.request(
        { projectId: snapshot.project.id, revision: snapshot.revision },
        true,
      );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(append).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);
    publisher.present(ticket);
    callbacks[0]!(0);
    await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
    await d.session.flush();
    expect(d.session.read()).toMatchObject({ events: 1, pending: 0, error: false });
  } finally {
    await d.session.dispose();
    publisher.release();
    d.db.close();
    vi.unstubAllGlobals();
  }
});
describe("automatic durable animation session", () => {
  it("captures each valid transaction once while selection and rejected edits do not write history", async () => {
    const { db, store, engine, session, errors, attach } = await fixture();
    try {
      const listener = vi.fn(),
        unsubscribe = session.subscribe(listener),
        append = vi.spyOn(store, "append");
      await attach();
      expect(session.read()).toMatchObject({
        ready: true,
        recording: true,
        events: 0,
        pending: 0,
        error: false,
      });
      engine.select(["shape"]);
      engine.setPage("page");
      expect(() =>
        engine.execute({ type: "updateLayers", ids: ["shape"], patch: { opacity: 2 } }),
      ).toThrow();
      await session.flush();
      expect(append).not.toHaveBeenCalled();
      engine.transaction([
        { type: "updateLayers", ids: ["shape"], patch: { x: 10 } },
        { type: "updateLayers", ids: ["shape"], patch: { y: 20 } },
      ]);
      expect(session.read().pending).toBe(1);
      await session.flush();
      expect(session.read()).toMatchObject({ events: 1, pending: 0, version: 1 });
      const page = await session.page();
      expect(page.entries).toHaveLength(1);
      expect(page.entries[0]!.event.commands).toEqual([
        { type: "updateLayers", summary: true },
        { type: "updateLayers", summary: true },
      ]);
      const replay = await session.replay();
      expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]).toMatchObject({
        x: 10,
        y: 20,
      });
      expect(listener).toHaveBeenCalled();
      unsubscribe();
      const before = listener.mock.calls.length;
      await session.dispose();
      engine.execute({ type: "renameProject", name: "After dispose" });
      await session.flush();
      expect(listener.mock.calls).toHaveLength(before);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await session.dispose();
      db.close();
    }
  });
  it("pauses recording durably and resumes with a checkpoint instead of replaying missed edits", async () => {
    const { db, engine, session, attach } = await fixture();
    try {
      await attach();
      engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 1 } });
      await session.flush();
      await session.stop();
      expect(session.read().recording).toBe(false);
      engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 20 } });
      await session.flush();
      expect(session.read().events).toBe(1);
      await session.start();
      expect(session.read().recording).toBe(true);
      expect(session.read().events).toBe(2);
      engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 30 } });
      await session.flush();
      await session.configure({ limit: 50 });
      expect(session.read().limit).toBe(50);
      const replay = await session.replay();
      expect(replay.events[1]!.after!.pages[0]!.layers[0]!.x).toBe(20);
      expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(30);
    } finally {
      await session.dispose();
      db.close();
    }
  });
  it("routes project switches independently and keeps latest project metadata visible", async () => {
    const { db, store, engine, session, attach } = await fixture();
    try {
      await attach();
      engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 1 } });
      const first = engine.getSnapshot().project;
      const second = createProject({ id: "second", pages: [createPage({ id: "second-page" })] });
      engine.load(second);
      engine.execute({
        type: "addLayers",
        layers: [createLayer("rectangle", { id: "second-shape" })],
      });
      await session.flush();
      expect(session.read().events).toBe(2);
      expect((await store.info(first.id))!.count).toBe(1);
      engine.load(first);
      await session.flush();
      expect(session.read().events).toBe(2);
      expect((await session.page()).entries.every((entry) => entry.projectId === first.id)).toBe(
        true,
      );
      expect((await store.replay(second.id)).events).toHaveLength(2);
    } finally {
      await session.dispose();
      db.close();
    }
  });
  it("recovers a failed append with a full lightweight state checkpoint and any missed original", async () => {
    const { db, store, engine, session, errors, attach } = await fixture();
    try {
      await attach();
      vi.spyOn(store, "append").mockRejectedValueOnce(new Error("quota"));
      engine.execute({
        type: "addLayers",
        layers: [createLayer("image", { id: "new-image", assetId: "photo" })],
        assets: [original],
      });
      await session.flush();
      expect(session.read()).toMatchObject({ events: 0, error: true, pending: 0 });
      expect(errors).toHaveBeenCalledOnce();
      engine.execute({ type: "updateLayers", ids: ["new-image"], patch: { x: 77 } });
      await session.flush();
      expect(session.read()).toMatchObject({ events: 1, error: false, pending: 0 });
      const replay = await session.replay(),
        result = evaluateReplay(replay, replay.duration);
      expect(result.pages[0]!.layers.map((layer) => layer.id)).toEqual(["shape", "new-image"]);
      expect(result.pages[0]!.layers[1]!.x).toBe(77);
      expect(result.assets.photo).toEqual(original);
      expect(replay.events[0]!.after).toBeDefined();
    } finally {
      await session.dispose();
      db.close();
    }
  });
  it("initializes from the current state after an initial storage failure without duplicating inserts", async () => {
    const { db, store, engine, session, errors, attach } = await fixture();
    try {
      vi.spyOn(store, "ensure").mockRejectedValueOnce(new Error("open failed"));
      await attach();
      expect(session.read().error).toBe(true);
      engine.execute({ type: "addLayers", layers: [createLayer("rectangle", { id: "added" })] });
      await session.flush();
      const replay = await session.replay(),
        result = evaluateReplay(replay, replay.duration);
      expect(result.pages[0]!.layers.map((layer) => layer.id)).toEqual(["shape", "added"]);
      expect(session.read()).toMatchObject({ ready: true, error: false, events: 1 });
      expect(errors).toHaveBeenCalledOnce();
    } finally {
      await session.dispose();
      db.close();
    }
  });
  it("rolls back an optimistic pause after a failed configuration and reports unattached access", async () => {
    const { db, store, session, errors, attach } = await fixture();
    try {
      await expect(session.page()).rejects.toThrow("not attached");
      await expect(session.replay()).rejects.toThrow("not attached");
      await session.configure({ limit: 20 });
      expect(session.read().error).toBe(true);
      await attach();
      vi.spyOn(store, "configure").mockRejectedValueOnce(new Error("blocked"));
      await session.stop();
      expect(session.read()).toMatchObject({ recording: true, error: true });
      expect(errors).toHaveBeenCalledOnce();
      await session.configure({ enabled: true, limit: 25 });
      expect(session.read()).toMatchObject({ recording: true, error: false, limit: 25 });
    } finally {
      await session.dispose();
      db.close();
    }
  });
  it("keeps one session per engine and does not attach duplicate observers", async () => {
    const { db, store, engine, session, attach } = await fixture();
    try {
      expect(getAnimationSession(engine)).toBe(getAnimationSession(engine));
      expect(getAnimationSession(new EditorEngine())).not.toBe(getAnimationSession(engine));
      await attach();
      const ensure = vi.spyOn(store, "ensure");
      session.attach(store, () => {});
      expect(ensure).not.toHaveBeenCalled();
      engine.execute({ type: "renameProject", name: "One" });
      await session.flush();
      expect(session.read().events).toBe(1);
    } finally {
      await session.dispose();
      db.close();
    }
  });
});

it("serializes a clear behind pending commits and before later gestures without duplicating or losing their deltas", async () => {
  const { db, engine, session, attach } = await fixture();
  try {
    await attach();
    engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 1 } });
    const clear = session.clear();
    engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 2 } });
    await clear;
    await session.flush();
    expect(session.read()).toMatchObject({ events: 1, error: false, pending: 0 });
    const replay = await session.replay();
    expect(replay.initial.pages[0]!.layers[0]!.x).toBe(1);
    expect(replay.events).toHaveLength(1);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(2);
  } finally {
    await session.dispose();
    db.close();
  }
});

it("rejects an explicit clear failure while preserving the durable journal and keeping the queue recoverable", async () => {
  const { db, store, engine, session, errors, attach } = await fixture();
  try {
    await attach();
    engine.execute({ type: "renameProject", name: "Before" });
    await session.flush();
    vi.spyOn(store, "clear").mockRejectedValueOnce(new Error("quota"));
    await expect(session.clear()).rejects.toThrow("quota");
    expect(session.read()).toMatchObject({ events: 1, pending: 0, error: true });
    expect(errors).toHaveBeenCalledOnce();
    engine.execute({ type: "renameProject", name: "After" });
    await session.flush();
    expect(session.read()).toMatchObject({ events: 2, error: false });
    expect((await session.replay()).events).toHaveLength(2);
  } finally {
    await session.dispose();
    db.close();
  }
});

it("captures immutable commit snapshots without detailed payloads and drains them after detach", async () => {
  const { db, store, engine, session, attach } = await fixture();
  try {
    const detailed = vi.spyOn(engine, "subscribeCommands");
    await attach();
    expect(detailed).not.toHaveBeenCalled();
    const append = vi.spyOn(store, "append");
    engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 11 } });
    engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 22 } });
    expect(append).not.toHaveBeenCalled();
    expect(session.read().pending).toBe(2);
    // Disposal removes the observer before draining. Already captured commits must survive it.
    await session.dispose();
    expect(append).toHaveBeenCalledTimes(2);
    const firstState = append.mock.calls[0]![5]!.current;
    const secondState = append.mock.calls[1]![5]!.current;
    expect(firstState.pages[0]!.layers[0]!.x).toBe(11);
    expect(secondState.pages[0]!.layers[0]!.x).toBe(22);
    engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 33 } });
    await session.flush();
    expect(append).toHaveBeenCalledTimes(2);
    const replay = await session.replay();
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(22);
  } finally {
    await session.dispose();
    db.close();
  }
});
