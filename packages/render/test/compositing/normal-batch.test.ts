import { describe, expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { RenderTarget, Texture } from "three/webgpu";
import { NormalBatch } from "../../src/compositing/normal-batch";
import { makeGpuRenderer } from "../gpu-fixture";
describe("normal layer batching", () => {
  it("composes fifty layers in one render pass and reuses geometry/materials for transforms", () => {
    const { renderer, fake } = makeGpuRenderer();
    const batch = new NormalBatch(renderer);
    const target = new RenderTarget(100, 100);
    const items = Array.from({ length: 50 }, (_, index) => ({
      layer: createLayer("image", {
        id: String(index),
        x: index,
        y: 2,
        width: 20,
        height: 10,
        rotation: 30,
      }),
      source: { texture: new Texture(), width: 20, height: 10, premultiplied: index % 2 === 0 },
    }));
    batch.draw([], 100, 100, target);
    expect(fake.render).not.toHaveBeenCalled();
    batch.draw(items, 100, 100, target);
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(batch.passes).toBe(1);
    const scene = fake.render.mock.calls[0]![0] as import("three/webgpu").Scene;
    expect(scene.children).toHaveLength(50);
    const mesh = scene.children[0] as import("three/webgpu").Mesh;
    expect(mesh.scale.y).toBe(-10);
    expect(mesh.position.x).toBe(10);
    const material = mesh.material;
    batch.draw(items, 100, 100, target);
    expect((scene.children[0] as import("three/webgpu").Mesh).material).toBe(material);
    batch.retain(new Set(["0"]));
    batch.dispose();
    expect(fake.autoClear).toBe(true);
  });
});
