import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, selectionComposition } from "@musart/core";
import { RenderTarget } from "three/webgpu";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { EffectResources } from "../../src/compositing/effect-resources";
import { installCanvasMock } from "../canvas-fixture";
import { clearSourceCache } from "../../src/surface/sources";
import { makeGpuRenderer } from "../gpu-fixture";
beforeEach(() => {
  installCanvasMock();
  clearSourceCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const giant = () =>
  createLayer("group", { id: "giant", x: 0, y: 0, width: 1080, height: 1920, opacity: 0.5 });
const tick = (parentId = "giant") =>
  createLayer("rectangle", {
    id: "tick",
    parentId,
    x: 60,
    y: 1403,
    width: 1,
    height: 11,
    fill: "#d5ff46",
  });
it("renders a tiny eightfold selection beneath a giant plain ancestor without a giant transport allocation", async () => {
  const { renderer, fake } = makeGpuRenderer();
  fake.backend.device.limits.maxTextureDimension2D = 128;
  const graph = new GpuCompositor(renderer),
    group = giant(),
    child = tick();
  const page = createPage({ width: 1080, height: 1920, layers: [group, child] });
  const before = structuredClone(page),
    scope = selectionComposition(page, [child.id]);
  const output = await graph.render(scope, {}, { scale: 8 });
  expect(output).toMatchObject({ width: 8, height: 88 });
  const targets = fake.setRenderTarget.mock.calls.flatMap(([target]) => (target ? [target] : []));
  expect(targets.some((target) => target.width === 10 && target.height === 90)).toBe(true);
  expect(targets.every((target) => target.width <= 128 && target.height <= 128)).toBe(true);
  const passes = graph.stats().passes;
  expect(await graph.render(scope, {}, { scale: 8 })).toBe(output);
  expect(graph.stats().passes).toBe(passes);
  expect(page).toEqual(before);
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ cacheBytes: 0, targets: 0 });
});
it("uses the complete current processing target for descendants beneath an effected ancestor", async () => {
  const { renderer, fake } = makeGpuRenderer();
  fake.backend.device.limits.maxTextureDimension2D = 128;
  const graph = new GpuCompositor(renderer),
    outer = giant();
  const treated = createLayer("group", {
    id: "treated",
    parentId: outer.id,
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    effects: [createEffect("blur", { scale: 8 })],
  });
  const inner = createLayer("group", {
    id: "inner",
    parentId: treated.id,
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
  });
  const child = { ...tick(inner.id), x: 30, y: 40 };
  const scope = selectionComposition(
    createPage({ width: 1080, height: 1920, layers: [outer, treated, inner, child] }),
    [child.id],
  );
  const apply = vi.spyOn(EffectResources.prototype, "apply");
  expect(await graph.render(scope, {}, { scale: 8 })).toMatchObject({ width: 8, height: 88 });
  expect(apply.mock.calls[0]?.slice(1, 3)).toEqual([64, 64]);
  const targets = fake.setRenderTarget.mock.calls.flatMap(([target]) => (target ? [target] : []));
  expect(targets.some((target) => target.width === 65 && target.height === 65)).toBe(true);
  expect(targets.every((target) => target.width <= 128 && target.height <= 128)).toBe(true);
  await graph.dispose();
});
it("preserves genuine oversized treatment and mask-source failures instead of changing their logical domain", async () => {
  const { renderer, fake } = makeGpuRenderer();
  fake.backend.device.limits.maxTextureDimension2D = 128;
  const graph = new GpuCompositor(renderer),
    group = giant(),
    child = tick();
  const treated = { ...group, effects: [createEffect("grain")] };
  const page = createPage({ width: 1080, height: 1920, layers: [treated, child] });
  await expect(
    graph.render(selectionComposition(page, [child.id]), {}, { scale: 8 }),
  ).rejects.toThrow("device limit");
  const mask = createLayer("group", {
    id: "mask-source",
    maskSource: true,
    x: 0,
    y: 0,
    width: 300,
    height: 300,
  });
  const white = createLayer("rectangle", {
    parentId: mask.id,
    x: 0,
    y: 0,
    width: 300,
    height: 300,
  });
  const owner = {
    ...child,
    parentId: null,
    mask: { layerId: mask.id, enabled: true, inverted: false },
  };
  await expect(
    graph.render(
      selectionComposition(createPage({ layers: [owner, mask, white] }), [owner.id]),
      {},
      { scale: 8 },
    ),
  ).rejects.toThrow("device limit");
  await graph.dispose();
});
it("skips an empty offscreen transport container without allocating its authored extent", async () => {
  const { renderer, fake } = makeGpuRenderer();
  fake.backend.device.limits.maxTextureDimension2D = 128;
  const graph = new GpuCompositor(renderer),
    group = { ...giant(), x: 1000, y: 1000 };
  const resize = vi.spyOn(RenderTarget.prototype, "setSize");
  await graph.render(createPage({ width: 16, height: 16, layers: [group, tick()] }), {});
  expect(resize.mock.calls.every(([width, height]) => width <= 128 && height <= 128)).toBe(true);
  expect(graph.stats().primitiveDraws).toBe(0);
  await graph.dispose();
});
