import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import { createLayerGeometryIndex } from "../../src/layers/geometry-index";
import { getWorldBounds, getWorldMatrix, hitTest } from "../../src/layers/geometry";
test("matches canonical geometry and hierarchical hit testing with cached immutable values", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "bottom", x: 0, y: 0, width: 500, height: 500 }),
      createLayer("group", { id: "g", x: 20, y: 30, width: 200, height: 200, rotation: 10 }),
      createLayer("ellipse", { id: "ellipse", parentId: "g", x: 10, y: 10, width: 40, height: 30 }),
      createLayer("rectangle", { id: "hidden", visible: false }),
      createLayer("rectangle", { id: "locked", locked: true }),
      createLayer("rectangle", { id: "zero", opacity: 0 }),
    ],
  });
  const immutable = new EditorEngine(createProject({ pages: [page] })).getSnapshot().project
    .pages[0]!;
  const index = createLayerGeometryIndex(immutable);
  expect(createLayerGeometryIndex(immutable)).toBe(index);
  expect(index.children("none")).toEqual([]);
  expect(index.children(null).map((layer) => layer.id)).toEqual([
    "bottom",
    "g",
    "hidden",
    "locked",
    "zero",
  ]);
  expect(index.ancestors("ellipse").map((layer) => layer.id)).toEqual(["g"]);
  expect(index.worldMatrix("ellipse")).toEqual(getWorldMatrix(page, "ellipse"));
  expect(index.worldBounds("ellipse")).toEqual(getWorldBounds(page, "ellipse"));
  expect(index.worldBounds("ellipse")).toBe(index.worldBounds("ellipse"));
  for (const point of [
    { x: 40, y: 50 },
    { x: 20, y: 30 },
    { x: 300, y: 300 },
    { x: 900, y: 900 },
  ])
    expect(index.hitTest(point)?.id).toBe(hitTest(page, point)?.id);
  expect(index.isVisible("hidden")).toBe(false);
  expect(index.isLocked("locked")).toBe(true);
});
test("never reuses a mutable command draft index and reports invalid IDs and cycles", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "g" }),
      createLayer("rectangle", { id: "c", parentId: "g", x: 0, y: 0 }),
    ],
  });
  const first = createLayerGeometryIndex(page);
  page.layers[0]!.x = 50;
  const next = createLayerGeometryIndex(page);
  expect(next).not.toBe(first);
  expect(next.worldBounds("c").x).toBe(50);
  expect(() => next.get("missing")).toThrow("missing");
  expect(() =>
    createLayerGeometryIndex(createPage({ layers: [page.layers[0]!, page.layers[0]!] })),
  ).toThrow("Duplicate");
  expect(() =>
    createLayerGeometryIndex(
      createPage({ layers: [createLayer("rectangle", { parentId: "unknown" })] }),
    ),
  ).toThrow("parent");
  const cycle = createLayerGeometryIndex(
    createPage({
      layers: [
        createLayer("group", { id: "a", parentId: "b" }),
        createLayer("group", { id: "b", parentId: "a" }),
      ],
    }),
  );
  expect(() => cycle.worldMatrix("a")).toThrow("cycle");
  expect(() => cycle.ancestors("a")).toThrow("cycle");
});
test("indexes ten thousand nested transforms iteratively, respecting inherited locks and clipping", () => {
  const layers = Array.from({ length: 10000 }, (_, i) =>
    createLayer("group", {
      id: `g${i}`,
      parentId: i ? `g${i - 1}` : null,
      x: 1,
      y: 1,
      width: 20,
      height: 20,
    }),
  );
  const page = createPage({ layers });
  const index = createLayerGeometryIndex(page);
  expect(index.worldMatrix("g9999")[4]).toBe(10000);
  expect(index.ancestors("g9999")).toHaveLength(9999);
  expect(index.hitTest({ x: 2, y: 2 })?.id).toBe("g1");
  expect(index.hitTest({ x: -1, y: -1 })).toBeNull();
  layers[0]!.locked = true;
  expect(createLayerGeometryIndex(page).isLocked("g9999")).toBe(true);
});

test("does not cache shallow-frozen containers whose layer geometry remains mutable", () => {
  const layer = createLayer("rectangle", { id: "shape", x: 1 });
  const page = createPage({ layers: [layer] });
  Object.freeze(page.layers);
  Object.freeze(page);
  const first = createLayerGeometryIndex(page);
  expect(first.worldBounds(layer.id).x).toBe(1);
  layer.x = 77;
  const next = createLayerGeometryIndex(page);
  expect(next).not.toBe(first);
  expect(next.worldBounds(layer.id).x).toBe(77);
  Object.freeze(layer);
  expect(createLayerGeometryIndex(page)).toBe(createLayerGeometryIndex(page));
});

test("protects cached matrices, bounds and child lists from accidental external mutation", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [createLayer("rectangle", { id: "shape", x: 1, y: 2, width: 10, height: 10 })],
        }),
      ],
    }),
  );
  const index = createLayerGeometryIndex(engine.getSnapshot().project.pages[0]!);
  const matrix = index.worldMatrix("shape");
  const bounds = index.worldBounds("shape");
  const children = index.children(null);
  expect(Reflect.set(matrix, "4", 100)).toBe(false);
  expect(Reflect.set(bounds, "x", 100)).toBe(false);
  expect(Reflect.set(children, "0", undefined)).toBe(false);
  expect(index.worldBounds("shape")).toEqual({ x: 1, y: 2, width: 10, height: 10 });
  expect(index.hitTest({ x: 5, y: 5 })?.id).toBe("shape");
  expect(index.byId.size).toBe(1);
  expect([...index.byId.keys()]).toEqual(["shape"]);
  expect([...index.byId.values()]).toEqual(children);
  expect([...index.byId.entries()]).toEqual([...index.byId]);
  expect("set" in index.byId || "delete" in index.byId || "clear" in index.byId).toBe(false);
  const context = { found: [] as string[] };
  index.byId.forEach(function (this: typeof context, layer, key, map) {
    expect(layer.id).toBe(key);
    expect(map).toBe(index.byId);
    this.found.push(key);
  }, context);
  expect(context.found).toEqual(["shape"]);
});
test("skips invisible mask-source subtrees for canvas picks while retaining explicit layer-panel access", () => {
  const target = createLayer("rectangle", {
    id: "target",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    mask: { layerId: "source-group", enabled: true, inverted: false },
  });
  const source = createLayer("group", {
    id: "source-group",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    maskSource: true,
  });
  const sourceChild = createLayer("ellipse", {
    id: "source-child",
    parentId: source.id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const group = createLayer("group", {
    id: "painted-group",
    x: 200,
    y: 0,
    width: 100,
    height: 100,
  });
  const attached = createLayer("rectangle", {
    id: "attached",
    parentId: group.id,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    maskSource: true,
  });
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [target, source, sourceChild, group, attached] })],
    }),
  );
  const index = createLayerGeometryIndex(engine.getSnapshot().project.pages[0]!);
  expect(index.hitTest({ x: 50, y: 50 })?.id).toBe(target.id);
  expect(index.hitTest({ x: 215, y: 15 })?.id).toBe(group.id);
  expect(index.get(sourceChild.id)).toMatchObject({ id: sourceChild.id, kind: "ellipse" });
  engine.select([sourceChild.id]);
  expect(engine.getSnapshot().selection).toEqual([sourceChild.id]);
  engine.execute({ type: "updateLayers", ids: [group.id], patch: { maskSource: true } });
  expect(
    createLayerGeometryIndex(engine.getSnapshot().project.pages[0]!).hitTest({ x: 215, y: 15 }),
  ).toBeNull();
  engine.undo();
  expect(
    createLayerGeometryIndex(engine.getSnapshot().project.pages[0]!).hitTest({ x: 215, y: 15 })?.id,
  ).toBe(group.id);
});

test("flat ten-thousand-layer picks reject misses without calculating world matrices or bounds", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", { id: `flat-${index}`, x: index * 4, y: 10, width: 3, height: 3 }),
  );
  const geometry = createLayerGeometryIndex(createPage({ layers }));
  const matrices = vi.spyOn(geometry, "worldMatrix"),
    bounds = vi.spyOn(geometry, "worldBounds");
  expect(geometry.hitTest({ x: 1, y: 11 })?.id).toBe("flat-0");
  expect(geometry.hitTest({ x: -10, y: 11 })).toBeNull();
  expect(matrices).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled();
});
test("parent-local picking agrees with canonical rotations, clipping, ellipse holes and ancestor flags", () => {
  const base = [
    createLayer("rectangle", { id: "back", x: 0, y: 0, width: 500, height: 500 }),
    createLayer("group", { id: "g", x: 80, y: 100, width: 200, height: 100, rotation: 37 }),
    createLayer("group", {
      id: "nested",
      parentId: "g",
      x: 10,
      y: 20,
      width: 90,
      height: 70,
      rotation: -15,
    }),
    createLayer("ellipse", {
      id: "ellipse",
      parentId: "nested",
      x: 20,
      y: 12,
      width: 40,
      height: 30,
      rotation: 20,
    }),
  ];
  for (const patch of [
    {},
    { visible: false },
    { opacity: 0 },
    { locked: true },
    { maskSource: true },
  ]) {
    const page = createPage({
      layers: base.map((layer) => (layer.id === "g" ? { ...layer, ...patch } : { ...layer })),
    });
    const geometry = createLayerGeometryIndex(page);
    for (let y = 0; y < 400; y += 13)
      for (let x = 0; x < 400; x += 17)
        expect(geometry.hitTest({ x, y })?.id).toBe(hitTest(page, { x, y })?.id);
  }
});

test("large root-only collective bounds and flags do not allocate transformation matrices", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", {
      id: `collective-${index}`,
      x: index,
      y: -index,
      width: 4,
      height: 6,
      locked: index === 1,
      opacity: index === 2 ? 0 : 1,
    }),
  );
  const geometry = createLayerGeometryIndex(createPage({ layers }));
  const matrices = vi.spyOn(geometry, "worldMatrix");
  for (const layer of layers) {
    const bounds = geometry.worldBounds(layer.id);
    expect(bounds).toEqual({ x: layer.x, y: layer.y, width: 4, height: 6 });
    expect(Object.isFrozen(bounds)).toBe(true);
    expect(geometry.worldBounds(layer.id)).toBe(bounds);
    expect(geometry.isLocked(layer.id)).toBe(layer.locked);
    expect(geometry.isVisible(layer.id)).toBe(layer.opacity > 0);
  }
  expect(matrices).not.toHaveBeenCalled();
});

test("collective bounds union ten thousand roots without allocating per-layer bounds or matrices", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", { id: `union-${index}`, x: index, y: -index, width: 4, height: 6 }),
  );
  const geometry = createLayerGeometryIndex(createPage({ layers })),
    bounds = vi.spyOn(geometry, "worldBounds"),
    matrices = vi.spyOn(geometry, "worldMatrix");
  const union = geometry.collectiveBounds(layers.map((layer) => layer.id));
  expect(union).toEqual({ x: 0, y: -9999, width: 10003, height: 10005 });
  expect(Object.isFrozen(union)).toBe(true);
  expect(bounds).not.toHaveBeenCalled();
  expect(matrices).not.toHaveBeenCalled();
  expect(geometry.collectiveBounds(["missing"])).toBeNull();
  expect(geometry.collectiveBounds([])).toBeNull();
});

test("collective bounds preserve canonical nested and rotated geometry and skip removed selections", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "parent", x: 100, y: 80, width: 200, height: 160, rotation: 27 }),
      createLayer("rectangle", {
        id: "child",
        parentId: "parent",
        x: 15,
        y: 20,
        width: 40,
        height: 30,
        rotation: -13,
      }),
      createLayer("ellipse", { id: "root", x: -50, y: -30, width: 90, height: 60, rotation: 45 }),
    ],
  });
  const boxes = [getWorldBounds(page, "child"), getWorldBounds(page, "root")],
    left = Math.min(...boxes.map((box) => box.x)),
    top = Math.min(...boxes.map((box) => box.y));
  expect(createLayerGeometryIndex(page).collectiveBounds(["child", "missing", "root"])).toEqual({
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  });
});
