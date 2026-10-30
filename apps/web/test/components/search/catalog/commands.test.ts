import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SearchCommands } from "../../../../src/components/search/catalog/commands";
import { createSearchCommandItems } from "../../../../src/components/search/catalog/items";
import { bindingSnapshot } from "../../../../src/state/keybindings/preferences";

test("selection only changes cached availability, without translating static command metadata again", () => {
  const group = createLayer("group", { id: "group" }),
    shape = createLayer("rectangle", { id: "shape" }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [group, shape] })] })),
    cache = new SearchCommands(),
    t = vi.fn((key: string) => key),
    bindings = bindingSnapshot();
  const empty = cache.read(engine.getSnapshot(), t, bindings, "en"),
    translated = t.mock.calls.length;
  expect(empty.find((item) => item.id === "action:delete")?.disabled).toBeDefined();
  for (const selection of [[shape.id], [group.id], [shape.id, group.id], []]) {
    engine.select(selection);
    const rows = cache.read(engine.getSnapshot(), t, bindings, "en");
    expect(rows).toEqual(createSearchCommandItems(engine.getSnapshot(), (key) => key, bindings));
    expect(t).toHaveBeenCalledTimes(translated);
  }
  expect(cache.read(engine.getSnapshot(), t, bindings, "en")).toBe(empty);
  const localized = cache.read(engine.getSnapshot(), t, bindings, "fr");
  expect(localized).not.toBe(empty);
  const unbound = cache.read(engine.getSnapshot(), t, bindingSnapshot({ "action:save": [] }), "fr");
  expect(unbound.find((item) => item.id === "action:save")?.shortcut).toBeUndefined();
});

test("inherited locks and real undo/redo availability remain authoritative", () => {
  const group = createLayer("group", { id: "locked", locked: true }),
    child = createLayer("rectangle", { id: "child", parentId: group.id }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [group, child] })] })),
    cache = new SearchCommands(),
    bindings = bindingSnapshot(),
    t = (key: string) => key;
  engine.select([child.id]);
  expect(
    cache.read(engine.getSnapshot(), t, bindings, "en").find((item) => item.id === "effect:blur")
      ?.disabled,
  ).toBeDefined();
  engine.execute({ type: "updatePage", patch: { background: "#123456" } });
  expect(
    cache.read(engine.getSnapshot(), t, bindings, "en").find((item) => item.id === "action:undo")
      ?.disabled,
  ).toBeUndefined();
  engine.undo();
  expect(
    cache.read(engine.getSnapshot(), t, bindings, "en").find((item) => item.id === "action:redo")
      ?.disabled,
  ).toBeUndefined();
});

test("Motion playback availability follows mode changes without losing cached metadata", () => {
  const engine = new EditorEngine(createProject()),
    cache = new SearchCommands(),
    bindings = bindingSnapshot(),
    t = (key: string) => key;
  const read = () =>
    cache
      .read(engine.getSnapshot(), t, bindings, "en")
      .find((item) => item.id === "action:togglePlayback");
  expect(read()?.disabled).toBe("motion:requiresMotion");
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  expect(read()?.disabled).toBeUndefined();
  engine.undo();
  expect(read()?.disabled).toBe("motion:requiresMotion");
});
