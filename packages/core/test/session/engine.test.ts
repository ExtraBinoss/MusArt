import { describe, expect, it, vi } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import type { Command, Project } from "../../src/document/model";
import type { CommandCommit, CommandCommitInfo } from "../../src/animation/model";

function setup(project?: Project) {
  const engine = new EditorEngine(project);
  const page = () =>
    engine.getSnapshot().project.pages.find((item) => item.id === engine.getSnapshot().pageId)!;
  return { engine, page };
}
describe("immutable document session", () => {
  it("starts with a valid default and stable immutable snapshots", () => {
    const project = createProject();
    const { engine } = setup(project);
    expect(engine.getSnapshot()).toBe(engine.getSnapshot());
    expect(engine.getSnapshot()).toMatchObject({
      revision: 0,
      canUndo: false,
      canRedo: false,
      selection: [],
    });
    expect(engine.getSnapshot().project).not.toBe(project);
    expect(() => {
      engine.getSnapshot().project.name = "Tamper";
    }).toThrow();
    project.name = "Caller edit";
    expect(engine.getSnapshot().project.name).toBe("Sans titre");
    expect(() => new EditorEngine(project, { historyLimit: 0 })).toThrow();
    expect(() => new EditorEngine(project, { historyLimit: 101 })).toThrow();
  });
  it("groups a gesture into a single undo entry and restores exact states with redo", () => {
    const { engine, page } = setup();
    const rectangle = createLayer("rectangle", { id: "rectangle", x: 10 });
    engine.execute({ type: "addLayers", layers: [rectangle] });
    expect(engine.getSnapshot().selection).toEqual(["rectangle"]);
    engine.transaction([
      { type: "updateLayers", ids: ["rectangle"], patch: { x: 20 } },
      { type: "updateLayers", ids: ["rectangle"], patch: { x: 30, y: 40 } },
    ]);
    expect(page().layers[0]).toMatchObject({ x: 30, y: 40 });
    engine.undo();
    expect(page().layers[0]).toMatchObject({ x: 10, y: 80 });
    engine.redo();
    expect(page().layers[0]).toMatchObject({ x: 30, y: 40 });
    engine.undo();
    engine.undo();
    expect(page().layers).toEqual([]);
    expect(engine.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });
    engine.undo();
    engine.redo();
    engine.redo();
    engine.redo();
    expect(engine.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
    expect(page().layers[0]?.x).toBe(30);
    expect(rectangle.x).toBe(10);
  });
  it("rolls back the entire transaction on validation, missing IDs or a locked ancestor", () => {
    const parent = createLayer("group", { id: "group", locked: true });
    const child = createLayer("rectangle", { id: "child", parentId: "group" });
    const { engine } = setup(createProject({ pages: [createPage({ layers: [parent, child] })] }));
    const before = engine.getSnapshot();
    expect(() =>
      engine.transaction([
        { type: "renameProject", name: "Changed" },
        { type: "updateLayers", ids: ["child"], patch: { x: 900 } },
      ]),
    ).toThrow("verrouillé");
    expect(engine.getSnapshot()).toBe(before);
    expect(() =>
      engine.execute({ type: "updateLayers", ids: ["missing"], patch: { x: 1 } }),
    ).toThrow("introuvable");
    expect(() => engine.execute({ type: "updatePage", patch: { width: -1 } })).toThrow();
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["group"],
        patch: { locked: false, opacity: 0.5 },
      }),
    ).toThrow("verrouillé");
    engine.execute({ type: "updateLayers", ids: ["group"], patch: { locked: false } });
    engine.execute({ type: "updateLayers", ids: ["child"], patch: { x: 900 } });
    expect(engine.getSnapshot().project.pages[0]!.layers[1]?.x).toBe(900);
  });
  it("publishes changes and cleans up listeners; session selection creates no document history", () => {
    const { engine } = setup();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    const layer = createLayer("rectangle");
    engine.execute({ type: "addLayers", layers: [layer] });
    const revision = engine.getSnapshot().revision;
    engine.select([layer.id, layer.id]);
    expect(listener).toHaveBeenCalledTimes(1);
    engine.select([]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().revision).toBe(revision);
    expect(() => engine.select(["missing"])).toThrow();
    const secondPage = createPage();
    engine.execute({ type: "addPage", page: secondPage });
    expect(engine.getSnapshot().pageId).toBe(secondPage.id);
    engine.setPage(secondPage.id);
    expect(listener).toHaveBeenCalledTimes(3);
    engine.setPage(engine.getSnapshot().project.pages[0]!.id);
    expect(engine.getSnapshot().selection).toEqual([]);
    expect(() => engine.setPage("missing")).toThrow();
    unsubscribe();
    engine.select([layer.id]);
    expect(listener).toHaveBeenCalledTimes(4);
  });
  it("caps history at 100 states and discards redo after a new edit", () => {
    const { engine } = setup();
    for (let index = 0; index < 102; index += 1)
      engine.execute({ type: "renameProject", name: `Project ${index}` });
    for (let index = 0; index < 100; index += 1) engine.undo();
    expect(engine.getSnapshot().project.name).toBe("Project 1");
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.redo();
    engine.execute({ type: "renameProject", name: "New branch" });
    expect(engine.getSnapshot().canRedo).toBe(false);
    const limited = new EditorEngine(createProject(), { historyLimit: 2 });
    for (let index = 0; index < 3; index += 1)
      limited.execute({ type: "renameProject", name: `v${index}` });
    limited.undo();
    limited.undo();
    expect(limited.getSnapshot().project.name).toBe("v0");
  });
  it("loads a validated isolated project and clears stale history and selection", () => {
    const { engine } = setup();
    engine.execute({ type: "addLayers", layers: [createLayer("ellipse")] });
    const project = createProject({ name: "Loaded" });
    engine.load(project);
    expect(engine.getSnapshot()).toMatchObject({
      project: { name: "Loaded" },
      canUndo: false,
      canRedo: false,
      selection: [],
    });
    project.name = "Caller tamper";
    expect(engine.getSnapshot().project.name).toBe("Loaded");
    const before = engine.getSnapshot();
    expect(() => engine.load({} as never)).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  });
  it("preserves embedded source strings and stamps commits through an injected clock", () => {
    const { engine } = setup();
    const asset = {
      id: "asset",
      name: "Pixel",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
    };
    engine.execute({ type: "addAssets", assets: [asset] });
    asset.name = "Mutated caller";
    expect(engine.getSnapshot().project.assets.asset?.name).toBe("Pixel");
    const timed = new EditorEngine(createProject(), { now: () => "2026-10-27T00:00:00.000Z" });
    timed.execute({ type: "renameProject", name: "Timed" });
    expect(timed.getSnapshot().project.updatedAt).toBe("2026-10-27T00:00:00.000Z");
  });
  it("handles empty transactions and wraps malformed commands with stable errors", () => {
    const { engine } = setup();
    const before = engine.getSnapshot();
    engine.transaction([]);
    expect(engine.getSnapshot()).toBe(before);
    expect(() =>
      engine.transaction(
        Array.from({ length: 1001 }, () => ({ type: "renameProject", name: "x" })) as Command[],
      ),
    ).toThrow("longue");
    expect(() => engine.transaction(null as never)).toThrow("invalide");
    expect(() => engine.execute(null as never)).toThrow();
    expect(() => engine.execute({ type: "unknown" } as never)).toThrow("Commande inconnue");
    const throwing = new EditorEngine(createProject(), {
      now: () => {
        throw "clock failed";
      },
    });
    expect(() => throwing.execute({ type: "renameProject", name: "x" })).toThrow(
      "Commande invalide",
    );
  });
  it("does not reuse occupied IDs when duplicating and preserves effect ordering", () => {
    const group = createLayer("group", { id: "layer-1" });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: group.id,
      effects: [createEffect("grayscale"), createEffect("dither")],
    });
    const { engine, page } = setup(
      createProject({
        pages: [
          createPage({
            layers: [group, child],
            guides: [{ id: "layer-2", axis: "y", position: 30 }],
          }),
        ],
      }),
    );
    engine.execute({ type: "duplicateLayers", ids: [group.id, child.id] });
    expect(page().layers).toHaveLength(4);
    const duplicateGroup = page().layers[2]!;
    const duplicateChild = page().layers[3]!;
    expect(duplicateGroup.id).not.toBe("layer-1");
    expect(duplicateGroup.id).not.toBe("layer-2");
    expect(duplicateGroup).toMatchObject({ x: 104, y: 104 });
    expect(duplicateChild).toMatchObject({ x: 80, y: 80, parentId: duplicateGroup.id });
    expect(duplicateChild.effects.map((effect) => effect.type)).toEqual(["grayscale", "dither"]);
    expect(duplicateChild.effects[0]?.id).not.toBe(child.effects[0]?.id);
    engine.undo();
    expect(page().layers).toHaveLength(2);
    engine.redo();
    expect(page().layers).toHaveLength(4);
    engine.execute({ type: "duplicateLayers", ids: [child.id] });
    expect(page().layers.at(-1)?.parentId).toBe(group.id);
  });
  it("reserves explicit IDs introduced earlier or later within one atomic transaction", () => {
    const { engine, page } = setup();
    const rectangle = createLayer("rectangle", { id: "group-1" });
    engine.transaction([
      { type: "addLayers", layers: [rectangle] },
      { type: "groupLayers", ids: [rectangle.id] },
    ]);
    const group = page().layers.find((layer) => layer.kind === "group")!;
    expect(group.id).toBe("group-2");
    expect(page().layers.find((layer) => layer.id === rectangle.id)?.parentId).toBe(group.id);
    engine.undo();
    expect(page().layers).toEqual([]);
    const futurePage = createPage({ id: "page-1" });
    const other = new EditorEngine(createProject());
    other.transaction([{ type: "addPage" }, { type: "addPage", page: futurePage }]);
    const ids = other.getSnapshot().project.pages.map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe("page-2");
  });
  it("publishes immutable payload-free commit information after state publication for every history transition", () => {
    const { engine } = setup(),
      order: string[] = [],
      information: CommandCommitInfo[] = [],
      detailed: CommandCommit[] = [];
    const stopState = engine.subscribe(() => order.push("state")),
      stopInfo = engine.subscribeCommitInfo((event) => {
        order.push("info");
        information.push(event);
        expect(event.snapshot).toBe(engine.getSnapshot());
      }),
      stopFull = engine.subscribeCommands((event) => {
        order.push("full");
        detailed.push(event);
      });
    const command: Command = { type: "renameProject", name: "Committed" };
    engine.execute(command);
    command.name = "Caller changed";
    engine.select([]);
    engine.undo();
    engine.redo();
    engine.load(createProject());
    expect(order).toEqual(Array.from({ length: 4 }, () => ["state", "info", "full"]).flat());
    expect(information.map((event) => event.kind)).toEqual(["commit", "undo", "redo", "load"]);
    expect(information.map((event) => event.types)).toEqual([["renameProject"], [], [], []]);
    expect(Object.keys(information[0]!).sort()).toEqual(["kind", "snapshot", "types"]);
    expect(Object.isFrozen(information[0])).toBe(true);
    expect(Object.isFrozen(information[0]!.types)).toBe(true);
    expect(information[0]!.snapshot.project.name).toBe("Committed");
    expect(detailed[0]!.commands).toEqual([{ type: "renameProject", name: "Committed" }]);
    expect(Object.isFrozen(detailed[0]!.commands[0])).toBe(true);
    stopInfo();
    stopInfo();
    stopFull();
    stopState();
    engine.execute({ type: "renameProject", name: "Unobserved" });
    expect(information).toHaveLength(4);
    expect(detailed).toHaveLength(4);
  });
  it("does not copy full command payloads for commit-info-only subscribers", () => {
    const reads = (mode: "none" | "summary" | "full") => {
      const layer = createLayer("rectangle"),
        { engine } = setup(createProject({ pages: [createPage({ layers: [layer] })] }));
      let count = 0;
      const patch = Object.defineProperty({}, "x", {
        enumerable: true,
        get: () => {
          count++;
          return 12;
        },
      });
      if (mode === "summary") engine.subscribeCommitInfo(() => {});
      if (mode === "full") engine.subscribeCommands(() => {});
      engine.execute({ type: "updateLayers", ids: [layer.id], patch });
      return count;
    };
    const baseline = reads("none");
    expect(reads("summary")).toBe(baseline);
    expect(reads("full")).toBe(baseline + 1);
  });
  it("reports commit-info listener failures without rolling back an already published transaction", () => {
    const { engine } = setup(),
      error = new Error("Observer failed"),
      stop = engine.subscribeCommitInfo(() => {
        throw error;
      });
    expect(() => engine.execute({ type: "renameProject", name: "Durable snapshot" })).toThrow(
      error,
    );
    expect(engine.getSnapshot().project.name).toBe("Durable snapshot");
    stop();
    engine.undo();
    expect(engine.getSnapshot().project.name).toBe("Sans titre");
  });
  it.each(["state", "info", "full"] as const)(
    "preserves FIFO commit snapshots when a %s listener commits another edit",
    (port) => {
      const { engine } = setup(),
        information: CommandCommitInfo[] = [],
        detailed: CommandCommit[] = [],
        order: string[] = [];
      engine.subscribeCommitInfo((event) => {
        information.push(event);
        order.push(`info:${event.snapshot.project.name}`);
      });
      engine.subscribeCommands((event) => {
        detailed.push(event);
        order.push(`full:${event.snapshot.project.name}`);
      });
      let nested = false;
      const commit = () => {
        if (!nested && engine.getSnapshot().project.name === "A") {
          nested = true;
          engine.execute({ type: "renameProject", name: "B" });
        }
      };
      if (port === "state") engine.subscribe(commit);
      else if (port === "info") engine.subscribeCommitInfo(commit);
      else engine.subscribeCommands(commit);
      engine.execute({ type: "renameProject", name: "A" });
      expect(order).toEqual(["info:A", "full:A", "info:B", "full:B"]);
      expect(information.map((event) => event.snapshot.revision)).toEqual([1, 2]);
      expect(detailed.map((event) => event.snapshot.project.name)).toEqual(["A", "B"]);
      expect(detailed.map((event) => event.commands)).toEqual([
        [{ type: "renameProject", name: "A" }],
        [{ type: "renameProject", name: "B" }],
      ]);
      expect(Object.isFrozen(information[0]!.snapshot)).toBe(true);
      expect(engine.getSnapshot().project.name).toBe("B");
    },
  );
  it("queues undo and load transitions from snapshot listeners with their own committed state", () => {
    const { engine } = setup(),
      information: CommandCommitInfo[] = [],
      detailed: CommandCommit[] = [],
      replacement = createProject({ name: "Loaded" });
    let nested = false;
    engine.subscribe(() => {
      if (!nested && engine.getSnapshot().project.name === "A") {
        nested = true;
        engine.undo();
        engine.load(replacement);
      }
    });
    engine.subscribeCommitInfo((event) => information.push(event));
    engine.subscribeCommands((event) => detailed.push(event));
    engine.execute({ type: "renameProject", name: "A" });
    expect(information.map((event) => event.kind)).toEqual(["commit", "undo", "load"]);
    expect(information.map((event) => event.snapshot.project.name)).toEqual([
      "A",
      "Sans titre",
      "Loaded",
    ]);
    expect(detailed.map((event) => event.snapshot)).toEqual(
      information.map((event) => event.snapshot),
    );
    expect(detailed.map((event) => event.snapshot.revision)).toEqual([1, 2, 3]);
    expect(engine.getSnapshot().canUndo).toBe(false);
  });
  it("drains nested commits and other observer ports before propagating a callback error", () => {
    const { engine } = setup(),
      error = new Error("Callback failed"),
      information: string[] = [],
      detailed: string[] = [];
    const stop = engine.subscribeCommitInfo((event) => {
      if (event.snapshot.project.name === "A") {
        engine.execute({ type: "renameProject", name: "B" });
        throw error;
      }
    });
    engine.subscribeCommitInfo((event) => information.push(event.snapshot.project.name));
    engine.subscribeCommands((event) => detailed.push(event.snapshot.project.name));
    expect(() => engine.execute({ type: "renameProject", name: "A" })).toThrow(error);
    expect(information).toEqual(["A", "B"]);
    expect(detailed).toEqual(["A", "B"]);
    stop();
    engine.execute({ type: "renameProject", name: "C" });
    expect(detailed).toEqual(["A", "B", "C"]);
  });
  it("preserves a snapshot-listener error while delivering its already committed transitions", () => {
    const { engine } = setup(),
      original = new Error("State listener failed"),
      information: string[] = [];
    let first = true;
    engine.subscribe(() => {
      if (first) {
        first = false;
        engine.execute({ type: "renameProject", name: "B" });
        throw original;
      }
    });
    engine.subscribeCommitInfo((event) => {
      information.push(event.snapshot.project.name);
      throw new Error("Commit listener also failed");
    });
    expect(() => engine.execute({ type: "renameProject", name: "A" })).toThrow(original);
    expect(information).toEqual(["A", "B"]);
  });
  it("detaches detailed command values and array order before snapshot listeners can mutate caller input", () => {
    const { engine } = setup(),
      commands: Command[] = [{ type: "renameProject", name: "A" }],
      detailed: CommandCommit[] = [];
    engine.subscribeCommands((event) => detailed.push(event));
    engine.subscribe(() => {
      const command = commands[0] as Extract<Command, { type: "renameProject" }>;
      command.name = "B";
      commands.push({ type: "renameProject", name: "Unexpected" });
      commands.reverse();
    });
    engine.transaction(commands);
    expect(engine.getSnapshot().project.name).toBe("A");
    expect(detailed[0]!.commands).toEqual([{ type: "renameProject", name: "A" }]);
    expect(detailed[0]!.snapshot.project.name).toBe("A");
    expect(Object.isFrozen(detailed[0]!.commands)).toBe(true);
  });
  it("keeps detailed insertion payloads independent of later commands in the same transaction", () => {
    const { engine } = setup(),
      layer = createLayer("rectangle", { id: "inserted", x: 12 }),
      detailed: CommandCommit[] = [];
    engine.subscribeCommands((event) => detailed.push(event));
    engine.transaction([
      { type: "addLayers", layers: [layer] },
      { type: "updateLayers", ids: [layer.id], patch: { x: 99 } },
    ]);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(99);
    const insertion = detailed[0]!.commands[0] as Extract<Command, { type: "addLayers" }>;
    expect(insertion.layers[0]!.x).toBe(12);
    expect(layer.x).toBe(12);
  });
  it("rolls back safely if a detailed payload cannot be captured before publication", () => {
    const layer = createLayer("rectangle"),
      { engine } = setup(createProject({ pages: [createPage({ layers: [layer] })] })),
      before = engine.getSnapshot(),
      info = vi.fn();
    let reads = 0;
    const patch = Object.defineProperty({}, "x", {
      enumerable: true,
      get: () => {
        if (++reads > 1) throw new Error("Unreadable command payload");
        return 12;
      },
    });
    engine.subscribeCommands(() => {});
    engine.subscribeCommitInfo(info);
    expect(() => engine.execute({ type: "updateLayers", ids: [layer.id], patch })).toThrow(
      "Unreadable",
    );
    expect(engine.getSnapshot()).toBe(before);
    expect(info).not.toHaveBeenCalled();
    engine.execute({ type: "renameProject", name: "Still valid" });
    expect(engine.getSnapshot().project.name).toBe("Still valid");
  });
});

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
    pending.commit();
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
    expect(events).toHaveBeenCalledTimes(1);
    expect(() => pending.commit()).toThrow("no longer active");
    engine.undo();
    expect(engine.getSnapshot().project).toBe(before.project);
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
    engine.redo();
    expect(engine.getSnapshot().project.name).toBe("Durable");
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
