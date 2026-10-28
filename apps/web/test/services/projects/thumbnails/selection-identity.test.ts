import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Asset,
} from "@musart/core";
import { SelectionPreviewIdentity } from "../../../../src/services/projects/thumbnails/selection-identity";

test("unrelated edits and layer metadata preserve selected appearance; paint and ancestor processing invalidate it", () => {
  const group = createLayer("group"),
    selected = createLayer("text", { parentId: group.id }),
    unrelated = createLayer("rectangle"),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [group, selected, unrelated] })] }),
    ),
    cache = new SelectionPreviewIdentity(),
    read = (id: string) => {
      const project = engine.getSnapshot().project;
      return cache.read(project.pages[0]!, project.assets, [id]);
    };
  const original = read(selected.id),
    groupOriginal = read(group.id);
  engine.execute({ type: "updateLayers", ids: [unrelated.id], patch: { fill: "#ff0000" } });
  expect(read(selected.id)).toBe(original);
  expect(read(group.id)).toBe(groupOriginal);
  engine.execute({
    type: "updateLayers",
    ids: [selected.id],
    patch: { name: "Renamed", locked: true, margin: { top: 10, right: 0, bottom: 0, left: 0 } },
  });
  expect(read(selected.id)).toBe(original);
  engine.execute({ type: "updateLayers", ids: [selected.id], patch: { locked: false } });
  engine.execute({ type: "updateLayers", ids: [selected.id], patch: { fill: "#00ff00" } });
  expect(read(selected.id)).not.toBe(original);
  expect(read(group.id)).not.toBe(groupOriginal);
  const painted = read(selected.id);
  engine.execute({
    type: "updateLayers",
    ids: [group.id],
    patch: { effects: [createEffect("blur")] },
  });
  expect(read(selected.id)).not.toBe(painted);
  const grouped = read(selected.id);
  engine.execute({ type: "updatePage", patch: { colorSpace: "display-p3" } });
  expect(read(selected.id)).not.toBe(grouped);
});

test("enabled nested mask subtrees and their ancestor masks participate, including inversion", () => {
  const outer = createLayer("group"),
    source = createLayer("group", { parentId: outer.id, maskSource: true }),
    child = createLayer("rectangle", { parentId: source.id }),
    extra = createLayer("rectangle", { parentId: source.id }),
    mask = createLayer("ellipse", { maskSource: true }),
    target = createLayer("rectangle", {
      mask: { layerId: source.id, enabled: true, inverted: false },
    }),
    page = createPage({ layers: [outer, source, child, extra, mask, target] }),
    cache = new SelectionPreviewIdentity();
  const read = (value = page) => cache.read(value, {}, [target.id]);
  const first = read();
  const changedChild = {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === extra.id ? { ...layer, fill: "#123456" } : layer,
    ),
  };
  expect(read(changedChild)).not.toBe(first);
  const ancestorMask = {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === outer.id
        ? { ...layer, mask: { layerId: mask.id, enabled: true, inverted: false } }
        : layer,
    ),
  };
  const masked = read(ancestorMask);
  expect(masked).not.toBe(first);
  expect(
    read({
      ...ancestorMask,
      layers: ancestorMask.layers.map((layer) =>
        layer.id === mask.id ? { ...layer, opacity: 0.4 } : layer,
      ),
    }),
  ).not.toBe(masked);
  expect(
    read({
      ...page,
      layers: page.layers.map((layer) =>
        layer.id === target.id ? { ...layer, mask: { ...layer.mask!, inverted: true } } : layer,
      ),
    }),
  ).not.toBe(first);
  const disabled = {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === target.id ? { ...layer, mask: { ...layer.mask!, enabled: false } } : layer,
    ),
  };
  expect(read(disabled)).toBe(
    read({
      ...disabled,
      layers: disabled.layers.map((layer) =>
        layer.id === child.id ? { ...layer, fill: "#999999" } : layer,
      ),
    }),
  );
});

test("asset identity never serializes original bytes and missing selections reject truthfully", () => {
  const asset: Asset = {
      id: "a",
      name: "original",
      width: 2,
      height: 2,
      mime: "image/png",
      get dataUrl(): string {
        throw Error("Image bytes were read");
      },
    },
    image = createLayer("image", { assetId: "a" }),
    page = createPage({ layers: [image] }),
    cache = new SelectionPreviewIdentity(),
    first = cache.read(page, { a: asset }, [image.id]);
  expect(cache.read(page, { a: asset, unused: asset }, [image.id])).toBe(first);
  expect(
    cache.read(
      page,
      { a: { id: "a", name: "new", width: 2, height: 2, mime: "image/png", dataUrl: "new" } },
      [image.id],
    ),
  ).not.toBe(first);
  expect(() => cache.read(page, {}, ["missing"])).toThrow("missing");
  const original = {
    id: "a",
    name: "old",
    width: 2,
    height: 2,
    mime: "image/png",
    dataUrl: "original bytes",
  };
  const stable = cache.read(page, { a: original }, [image.id]);
  expect(cache.read(page, { a: { ...original, name: "new metadata" } }, [image.id])).toBe(stable);
});

test("mutable and shallow-frozen external values never donate stale paint or asset identities", () => {
  const effect = createEffect("blur"),
    layer = createLayer("image", { assetId: "a", effects: [effect] }),
    asset = { id: "a", name: "original", width: 2, height: 2, mime: "image/png", dataUrl: "first" },
    page = createPage({ layers: [layer] }),
    cache = new SelectionPreviewIdentity();
  const first = cache.read(page, { a: asset }, [layer.id]);
  layer.fill = "#334455";
  expect(cache.read(page, { a: asset }, [layer.id])).not.toBe(first);
  Object.freeze(layer);
  const shallow = cache.read(page, { a: asset }, [layer.id]);
  effect.amount = 0.9;
  expect(cache.read(page, { a: asset }, [layer.id])).not.toBe(shallow);
  const painted = cache.read(page, { a: asset }, [layer.id]);
  asset.dataUrl = "second";
  expect(cache.read(page, { a: asset }, [layer.id])).not.toBe(painted);
  expect(cache.read(page, { a: { ...asset } }, [layer.id])).toBe(
    cache.read(page, { a: asset }, [layer.id]),
  );
  const replacement = createLayer("rectangle", { id: "replacement" });
  page.layers = [replacement];
  expect(() => cache.read(page, { a: asset }, [layer.id])).toThrow("missing");
  expect(cache.read(page, {}, [replacement.id])).toContain(replacement.id);
});

test("opaque asset getters never donate aliases and replacing a getter invalidates without invoking it", () => {
  const firstGetter = () => {
      throw Error("First getter must not run");
    },
    secondGetter = () => {
      throw Error("Second getter must not run");
    },
    first = { id: "a", name: "First", width: 2, height: 2, mime: "image/png" } as Asset,
    second = { ...first } as Asset,
    page = createPage({ layers: [createLayer("image", { id: "image", assetId: "a" })] }),
    cache = new SelectionPreviewIdentity();
  Object.defineProperty(first, "dataUrl", { get: firstGetter, configurable: true });
  Object.defineProperty(second, "dataUrl", { get: secondGetter, configurable: true });
  const original = cache.read(page, { a: first }, ["image"]);
  expect(cache.read(page, { a: first }, ["image"])).toBe(original);
  expect(cache.read(page, { a: second }, ["image"])).not.toBe(original);
  Object.defineProperty(first, "dataUrl", { get: secondGetter, configurable: true });
  expect(cache.read(page, { a: first }, ["image"])).not.toBe(original);
});

test("explicit mask inspection includes disabled mask originals and source graphs without changing normal layer identity", () => {
  const source = createLayer("rectangle", { id: "mask-source", maskSource: true, fill: "#fff" });
  const owner = createLayer("rectangle", {
    id: "owner",
    mask: { layerId: source.id, enabled: false, inverted: false },
  });
  const page = createPage({ layers: [source, owner] }),
    cache = new SelectionPreviewIdentity();
  const normal = cache.read(page, {}, [owner.id]),
    inspected = cache.read(page, {}, [owner.id], { includeDisabledMasks: true });
  const changed = { ...page, layers: [{ ...source, fill: "#000" }, owner] };
  expect(cache.read(changed, {}, [owner.id])).toBe(normal);
  expect(cache.read(changed, {}, [owner.id], { includeDisabledMasks: true })).not.toBe(inspected);
  const asset = {
    id: "asset",
    name: "Mask",
    width: 2,
    height: 2,
    mime: "image/png",
    dataUrl: "one",
  };
  const assetPage = createPage({
    layers: [{ ...owner, mask: { assetId: asset.id, enabled: false, inverted: false } }],
  });
  const initial = cache.read(assetPage, { asset }, [owner.id], { includeDisabledMasks: true });
  expect(
    cache.read(assetPage, { asset: { ...asset, dataUrl: "two" } }, [owner.id], {
      includeDisabledMasks: true,
    }),
  ).not.toBe(initial);
});
