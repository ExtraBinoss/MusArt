import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SearchCatalog } from "../../../../src/components/search/catalog/cache";
import { bindingSnapshot } from "../../../../src/state/keybindings/preferences";
test("reuses indexed document rows across selection/binding updates and invalidates project/locale/translator changes", () => {
  const layer = createLayer("text"),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    cache = new SearchCatalog(),
    t = vi.fn((key: string) => key),
    defaults = bindingSnapshot();
  const first = cache.read(engine.getSnapshot(), t, defaults, "fr"),
    row = first.find((item) => item.target.kind === "layer");
  engine.select([layer.id]);
  expect(
    cache
      .read(engine.getSnapshot(), t, defaults, "fr")
      .find((item) => item.target.kind === "layer"),
  ).toBe(row);
  const changed = cache.read(engine.getSnapshot(), t, bindingSnapshot({ "action:save": [] }), "fr");
  expect(changed.find((item) => item.id === "action:save")?.shortcut).toBeUndefined();
  expect(changed.find((item) => item.target.kind === "layer")).toBe(row);
  expect(
    cache
      .read(engine.getSnapshot(), t, defaults, "en")
      .find((item) => item.target.kind === "layer"),
  ).not.toBe(row);
  engine.load(createProject());
  expect(
    cache
      .read(engine.getSnapshot(), (key) => key, defaults, "en")
      .some((item) => item.id === row!.id),
  ).toBe(false);
});

test("ordinary selection changes reuse the full ten-thousand-row catalog and command metadata", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
      createLayer("rectangle", { id: `indexed-${index}`, name: `Layer ${index}` }),
    ),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers })] })),
    cache = new SearchCatalog(),
    t = vi.fn((key: string) => key),
    bindings = bindingSnapshot();
  cache.read(engine.getSnapshot(), t, bindings, "en");
  engine.select([layers[0]!.id]);
  const first = cache.read(engine.getSnapshot(), t, bindings, "en"),
    commands = cache.commands,
    categories = cache.categories,
    calls = t.mock.calls.length;
  engine.select([layers[9999]!.id]);
  expect(cache.read(engine.getSnapshot(), t, bindings, "en")).toBe(first);
  expect(cache.commands).toBe(commands);
  expect(cache.categories).toBe(categories);
  expect(t).toHaveBeenCalledTimes(calls);
  expect(first.filter((item) => item.target.kind === "layer")).toHaveLength(10000);
});

test("transform-only commits preserve prepared metadata without translating ten thousand layers again", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
      createLayer("rectangle", { id: `move-${index}`, name: `Layer ${index}` }),
    ),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers })] })),
    cache = new SearchCatalog(),
    t = vi.fn((key: string) => key),
    bindings = bindingSnapshot();
  engine.select([layers[0]!.id]);
  cache.read(engine.getSnapshot(), t, bindings, "en");
  engine.execute({ type: "updateLayers", ids: [layers[0]!.id], patch: { x: 200 } });
  const first = cache.read(engine.getSnapshot(), t, bindings, "en"),
    calls = t.mock.calls.length;
  engine.execute({ type: "updateLayers", ids: [layers[0]!.id], patch: { y: 300 } });
  expect(cache.read(engine.getSnapshot(), t, bindings, "en")).toBe(first);
  expect(t).toHaveBeenCalledTimes(calls);
  engine.execute({ type: "updateLayers", ids: [layers[0]!.id], patch: { name: "Renamed" } });
  const changed = cache.read(engine.getSnapshot(), t, bindings, "en");
  expect(changed).not.toBe(first);
  expect(changed.find((item) => item.id.endsWith(layers[0]!.id))?.label).toBe("Renamed");
});

test("revisiting selection gates reuses normalized commands and joined document rows", () => {
  const shape = createLayer("rectangle"),
    group = createLayer("group"),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [shape, group] })] })),
    cache = new SearchCatalog(),
    t = vi.fn((key: string) => key),
    bindings = bindingSnapshot();
  engine.select([group.id]);
  const grouped = cache.read(engine.getSnapshot(), t, bindings, "en"),
    groupCommands = cache.commands,
    groupCategories = cache.categories;
  expect(grouped.find((item) => item.id === "action:ungroup")?.disabled).toBeUndefined();
  engine.select([shape.id]);
  const ordinary = cache.read(engine.getSnapshot(), t, bindings, "en");
  expect(ordinary.find((item) => item.id === "action:ungroup")?.disabled).toBeDefined();
  const translated = t.mock.calls.length;
  engine.select([group.id]);
  expect(cache.read(engine.getSnapshot(), t, bindings, "en")).toBe(grouped);
  expect(cache.commands).toBe(groupCommands);
  expect(cache.categories).toBe(groupCategories);
  expect(t).toHaveBeenCalledTimes(translated);
  engine.execute({ type: "updateLayers", ids: [group.id], patch: { name: "New group" } });
  const renamed = cache.read(engine.getSnapshot(), t, bindings, "en");
  expect(renamed).not.toBe(grouped);
  expect(
    renamed.find((item) => item.target.kind === "layer" && item.target.layerId === group.id)?.label,
  ).toBe("New group");
  engine.select([shape.id]);
  const current = cache.read(engine.getSnapshot(), t, bindings, "en");
  expect(current).not.toBe(ordinary);
  expect(
    current.find((item) => item.target.kind === "layer" && item.target.layerId === group.id)?.label,
  ).toBe("New group");
});

test("bounds revisited gate states and invalidates bindings and language for every state", () => {
  const pages = Array.from({ length: 9 }, () => createPage()),
    engine = new EditorEngine(createProject({ pages })),
    cache = new SearchCatalog(),
    t = (key: string) => key,
    defaults = bindingSnapshot();
  const first = cache.read(engine.getSnapshot(), t, defaults, "en");
  engine.setPage(pages[1]!.id);
  const second = cache.read(engine.getSnapshot(), t, defaults, "en");
  for (const page of pages.slice(2, 8)) {
    engine.setPage(page.id);
    cache.read(engine.getSnapshot(), t, defaults, "en");
  }
  engine.setPage(pages[0]!.id);
  expect(cache.read(engine.getSnapshot(), t, defaults, "en")).toBe(first);
  engine.setPage(pages[8]!.id);
  cache.read(engine.getSnapshot(), t, defaults, "en");
  engine.setPage(pages[1]!.id);
  expect(cache.read(engine.getSnapshot(), t, defaults, "en")).not.toBe(second);
  const unbound = bindingSnapshot({ "action:save": [] });
  cache.read(engine.getSnapshot(), t, unbound, "en");
  engine.setPage(pages[0]!.id);
  const changed = cache.read(engine.getSnapshot(), t, unbound, "en");
  expect(changed).not.toBe(first);
  expect(changed.find((item) => item.id === "action:save")?.shortcut).toBeUndefined();
  expect(cache.read(engine.getSnapshot(), t, unbound, "fr")).not.toBe(changed);
});
