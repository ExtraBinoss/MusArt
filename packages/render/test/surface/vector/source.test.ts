import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { Mesh, RenderTarget, MeshBasicNodeMaterial, Vector4, type UniformNode } from "three/webgpu";
import { VectorSources } from "../../../src/surface/vector/source";
import { GpuResourceCache } from "../../../src/cache/GpuResourceCache";
import { makeGpuRenderer } from "../../gpu-fixture";
function paintOf(material: MeshBasicNodeMaterial) {
  let paint!: UniformNode<"vec4", Vector4>;
  material.fragmentNode!.traverse((node) => {
    if ("value" in node && node.value instanceof Vector4)
      paint = node as UniformNode<"vec4", Vector4>;
  });
  return paint;
}
it("retains triangulation and live fill uniforms, part colors, and renderer state", () => {
  const { renderer, fake } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    source = new VectorSources(renderer, cache),
    target = new RenderTarget(20, 20),
    old = new RenderTarget(2, 2);
  fake.setRenderTarget(old);
  const l = createLayer("vector", {
    fill: "#ff0000",
    vector: {
      viewBox: "10 20 20 20",
      parts: [{ path: "M10 20h20v20h-20z", fill: "#00ff00", opacity: 0.5 }],
    },
  });
  source.render(l, target);
  const scene = fake.render.mock.calls[0]![0],
    camera = fake.render.mock.calls[0]![1],
    mesh = scene.children[0] as Mesh,
    material = mesh.material as MeshBasicNodeMaterial,
    paint = paintOf(material);
  expect(paint.value.toArray()).toEqual([1, 0, 0, 0.5]);
  expect(camera).toMatchObject({ left: 10, right: 30, top: 20, bottom: 40 });
  source.render({ ...l, fill: "#0000ff" }, target);
  expect(source.parses).toBe(1);
  expect(paint.value.toArray()).toEqual([0, 0, 1, 0.5]);
  source.render(
    {
      ...l,
      vector: {
        ...l.vector!,
        preserveColors: true,
        parts: [{ ...l.vector!.parts![0]!, fill: "#00ff00", opacity: 0.8 }],
      },
    },
    target,
    true,
  );
  expect(source.parses).toBe(1);
  expect(paint.value.toArray()).toEqual([0, 1, 0, 0.8]);
  expect(cache.stats().cacheBytes).toBeGreaterThan(0);
  expect(renderer.getRenderTarget()).toBe(old);
  expect(renderer.autoClear).toBe(true);
  fake.render.mockImplementationOnce(() => {
    throw new Error("lost");
  });
  expect(() => source.render(l, target)).toThrow("lost");
  expect(renderer.getRenderTarget()).toBe(old);
  const dispose = vi.spyOn(material, "dispose");
  cache.clear();
  expect(dispose).toHaveBeenCalledOnce();
  target.dispose();
  old.dispose();
});
it("resolves currentColor and transparent stroke-only paints", () => {
  const { renderer, fake } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    source = new VectorSources(renderer, cache),
    target = new RenderTarget(20, 20);
  const l = createLayer("vector", {
    fill: "#aabbcc",
    stroke: "transparent",
    strokeWidth: 2,
    vector: {
      viewBox: "0 0 20 20",
      preserveColors: true,
      strokeOnly: true,
      parts: [{ path: "M2 2L18 18", stroke: "currentColor" }],
    },
  });
  source.render(l, target);
  const mesh = fake.render.mock.calls[0]![0].children[0] as Mesh,
    material = mesh.material as MeshBasicNodeMaterial,
    paint = paintOf(material);
  expect(paint.value.w).toBe(1);
  source.render(
    { ...l, vector: { ...l.vector!, parts: [{ path: "M2 2L18 18", stroke: "transparent" }] } },
    target,
  );
  expect(paint.value.w).toBe(0);
  cache.clear();
  target.dispose();
});
