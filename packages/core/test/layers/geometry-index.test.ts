import { expect, test } from "vitest";
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
