import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { InstancedMesh, Matrix4, RenderTarget, type Scene } from "three/webgpu";
import { makeGpuRenderer } from "../../gpu-fixture";
import { PrimitiveBatch } from "../../../src/compositing/primitives/batch";
import { MAX_PRIMITIVE_INSTANCES } from "../../../src/compositing/primitives/attributes";
import { PrimitivePaintCache } from "../../../src/compositing/primitives/paint-cache";
it("draws ten thousand ordered shapes in one instanced submission without textures or per-layer materials", () => {
  const { renderer, fake } = makeGpuRenderer(),
    batch = new PrimitiveBatch(renderer),
    target = new RenderTarget(64, 64);
  const layers = Array.from({ length: 10_000 }, (_, index) =>
    createLayer(index % 2 ? "ellipse" : "rectangle", {
      x: index,
      y: 5,
      width: 10,
      height: 8,
      radius: 20,
      fill: "#ff000080",
      stroke: "#00ff00",
      strokeWidth: 2,
      opacity: 0.4,
      rotation: index === 0 ? 90 : 0,
    }),
  );
  let instance: InstancedMesh | undefined;
  fake.render.mockImplementation((scene: Scene) => {
    instance = scene.children[0] as InstancedMesh;
    expect(instance).toBeInstanceOf(InstancedMesh);
  });
  batch.draw([], 64, 64, 1, target);
  expect(fake.render).not.toHaveBeenCalled();
  batch.draw(layers, 64, 64, 2, target);
  expect(fake.render).toHaveBeenCalledOnce();
  expect(instance!.count).toBe(10_000);
  expect(batch.instances).toBe(10_000);
  expect(batch.targets).toBe(0);
  expect(batch.bytes).toBe(batch.projectedBytes(1));
  expect(batch.bytes).toBeLessThan(2_000_000);
  const fill = instance!.geometry.getAttribute("primitiveFill"),
    shape = instance!.geometry.getAttribute("primitiveShape");
  expect(fill.getX(0)).toBe(1);
  expect(fill.getW(0)).toBeCloseTo(128 / 255);
  expect([shape.getX(0), shape.getY(0), shape.getZ(0), shape.getW(0)]).toEqual([20, 16, 8, 4]);
  const transform = new Matrix4();
  instance!.getMatrixAt(0, transform);
  expect(transform.elements[12]).toBe(5);
  expect(transform.elements[13]).toBe(9);
  expect(transform.elements[0]).toBeCloseTo(0);
  expect(transform.elements[1]).toBeCloseTo(10);
  const material = instance!.material;
  if (Array.isArray(material)) throw new Error("Expected one shared material");
  batch.draw(layers.slice(0, 1), 64, 64, 1, target);
  expect(instance!.count).toBe(1);
  expect(instance!.material).toBe(material);
  batch.draw([{ ...layers[0]!, fill: "#00ff0080" }], 64, 64, 1, target);
  expect(fill.getX(0)).toBe(0);
  expect(fill.getY(0)).toBe(1);
  expect(fill.getW(0)).toBeCloseTo(128 / 255);
  expect(fake.autoClear).toBe(true);
  expect(fake.getRenderTarget()).toBeNull();
  const disposeMesh = vi.spyOn(instance!, "dispose"),
    disposeGeometry = vi.spyOn(instance!.geometry, "dispose"),
    disposeMaterial = vi.spyOn(material, "dispose"),
    clearPaint = vi.spyOn(PrimitivePaintCache.prototype, "clear");
  batch.dispose();
  batch.dispose();
  expect(disposeMesh).toHaveBeenCalledOnce();
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(disposeMaterial).toHaveBeenCalledOnce();
  expect(clearPaint).toHaveBeenCalledOnce();
  clearPaint.mockRestore();
  expect(batch.bytes).toBe(0);
  expect(() => batch.draw(layers, 64, 64, 1, target)).toThrow("disposed");
  target.dispose();
});
it("releases replaced instance buffers, chunks larger runs and restores renderer state after a failed draw", () => {
  const { renderer, fake } = makeGpuRenderer(),
    batch = new PrimitiveBatch(renderer),
    previous = new RenderTarget(1, 1),
    target = new RenderTarget(8, 8),
    layer = createLayer("rectangle");
  let mesh: InstancedMesh | undefined;
  fake.render.mockImplementation((scene: Scene) => {
    mesh = scene.children[0] as InstancedMesh;
  });
  batch.draw([layer], 8, 8, 1, target);
  const old = mesh!,
    dispose = vi.spyOn(old, "dispose"),
    geometry = vi.spyOn(old.geometry, "dispose");
  batch.draw([layer, layer, layer], 8, 8, 1, target);
  expect(mesh).not.toBe(old);
  expect(dispose).toHaveBeenCalledOnce();
  expect(geometry).toHaveBeenCalledOnce();
  const counts: number[] = [];
  fake.render.mockImplementation((scene: Scene) => {
    counts.push((scene.children[0] as InstancedMesh).count);
  });
  batch.draw(
    Array.from({ length: MAX_PRIMITIVE_INSTANCES + 1 }, () => layer),
    8,
    8,
    1,
    target,
  );
  expect(counts).toEqual([MAX_PRIMITIVE_INSTANCES, 1]);
  fake.setRenderTarget(previous);
  fake.autoClear = true;
  fake.render.mockImplementationOnce(() => {
    throw new Error("lost");
  });
  expect(() => batch.draw([layer], 8, 8, 1, target)).toThrow("lost");
  expect(fake.getRenderTarget()).toBe(previous);
  expect(fake.autoClear).toBe(true);
  batch.dispose();
  target.dispose();
  previous.dispose();
});
