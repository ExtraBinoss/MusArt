import { describe, expect, it, vi } from "vitest";
import { EditorEngine } from "../../../src/session/engine";
import { createLayer, createPage, createProject } from "../../../src/document/factories";

describe("prepared durable transactions", () => {
  it("publishes only after commit, locks mutations and retains a single undo boundary", () => {
    const layer = createLayer("rectangle", { id: "prepared-layer" });
    const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
    const before = engine.getSnapshot(),
      events = vi.fn();
    engine.subscribeCommands(events);
    const pending = engine.reserveTransaction([{ type: "renameProject", name: "Durable" }]);
    expect(engine.getSnapshot()).toBe(before);
    expect(events).not.toHaveBeenCalled();
    expect(pending.project.name).toBe("Durable");
    for (const mutate of [
      () => engine.execute({ type: "renameProject", name: "Concurrent" }),
      () => engine.undo(),
      () => engine.redo(),
      () => engine.load(createProject()),
      () => engine.setPage(before.pageId),
    ])
      expect(mutate).toThrow("busy");
    engine.select([layer.id]);
    const selection = engine.getSnapshot().selection;
    pending.commit();
    expect(engine.getSnapshot().selection).toBe(selection);
    expect(events).toHaveBeenCalledTimes(1);
    expect(() => pending.commit()).toThrow("no longer active");
    engine.undo();
    expect(engine.getSnapshot().project).toBe(before.project);
    expect(engine.getSnapshot().selection).toBe(selection);
    engine.redo();
    expect(engine.getSnapshot().project.name).toBe("Durable");
    expect(engine.getSnapshot().selection).toBe(selection);
  });
  it.each([false, true])(
    "retains a late selection reference across property commit and history with deferLock=%s",
    (deferLock) => {
      const a = createLayer("rectangle", { id: "late-a" }),
        b = createLayer("rectangle", { id: "late-b" }),
        engine = new EditorEngine(createProject({ pages: [createPage({ layers: [a, b] })] }));
      engine.select([a.id]);
      const pending = engine.reserveTransaction(
        [{ type: "updateLayers", ids: [a.id], patch: { x: 120 } }],
        { deferLock },
      );
      engine.select([b.id]);
      const late = engine.getSnapshot();
      pending.lock();
      pending.commit();
      const committed = engine.getSnapshot();
      expect(committed.selection).toBe(late.selection);
      expect(committed.project.pages[0]!.layers[0]!.x).toBe(120);
      engine.undo();
      expect(engine.getSnapshot().project).toBe(late.project);
      expect(engine.getSnapshot().selection).toBe(late.selection);
      engine.redo();
      expect(engine.getSnapshot().project).toBe(committed.project);
      expect(engine.getSnapshot().selection).toBe(committed.selection);
    },
  );
  it("keeps an explicit command-result selection authoritative over a late selection", () => {
    const a = createLayer("rectangle", { id: "group-a" }),
      b = createLayer("rectangle", { id: "group-b" }),
      engine = new EditorEngine(createProject({ pages: [createPage({ layers: [a, b] })] }));
    engine.select([a.id, b.id]);
    const pending = engine.reserveTransaction([{ type: "groupLayers", ids: [a.id, b.id] }]);
    engine.select([b.id]);
    const late = engine.getSnapshot();
    pending.commit();
    const grouped = engine.getSnapshot();
    expect(grouped.selection).toHaveLength(1);
    expect(grouped.selection).not.toBe(late.selection);
    expect(
      grouped.project.pages[0]!.layers.find((layer) => layer.id === grouped.selection[0])?.kind,
    ).toBe("group");
    engine.undo();
    expect(engine.getSnapshot().selection).toBe(late.selection);
    engine.redo();
    expect(engine.getSnapshot().selection).toBe(grouped.selection);
  });
  it("cancels without publication or consuming generated IDs and rejects stale deferred preparations", () => {
    const project = createProject({
      pages: [createPage({ layers: [createLayer("rectangle", { id: "item" })] })],
    });
    const engine = new EditorEngine(project),
      control = new EditorEngine(project);
    const command = { type: "setCompositionMode", mode: "motion" } as const;
    const first = engine.reserveTransaction([command]);
    const candidate = first.project.pages[0]!.motion;
    first.cancel();
    first.cancel();
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.execute(command);
    control.execute(command);
    expect(engine.getSnapshot().project.pages[0]!.motion).toEqual(candidate);
    expect(engine.getSnapshot().project).toEqual(control.getSnapshot().project);
    const stale = engine.reserveTransaction([{ type: "renameProject", name: "Stale" }], {
      deferLock: true,
    });
    engine.execute({ type: "renameProject", name: "Current" });
    expect(() => stale.lock()).toThrow("stale");
    stale.cancel();
    expect(engine.getSnapshot().project.name).toBe("Current");
  });
  it("releases before notifying reentrant subscribers and never locks failed validation", () => {
    const engine = new EditorEngine();
    expect(() => engine.reserveTransaction([{ type: "renameProject", name: "" }])).toThrow();
    const unsubscribe = engine.subscribe(() => {
      if (engine.getSnapshot().project.name === "First")
        engine.execute({ type: "renameProject", name: "Second" });
    });
    engine.reserveTransaction([{ type: "renameProject", name: "First" }]).commit();
    expect(engine.getSnapshot().project.name).toBe("Second");
    const empty = engine.reserveTransaction([]);
    empty.commit();
    unsubscribe();
    engine.undo();
    expect(engine.getSnapshot().project.name).toBe("First");
  });
});
