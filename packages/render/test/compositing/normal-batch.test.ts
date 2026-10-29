import { describe, expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import {
  Mesh,
  RenderTarget,
  Texture,
  type MeshBasicNodeMaterial,
  type PlaneGeometry,
  type Scene,
} from "three/webgpu";
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

it("retains already drawn live items through cached subtrees and releases removed/page-local items", () => {
  const { renderer, fake } = makeGpuRenderer(),
    batch = new NormalBatch(renderer);
  const target = new RenderTarget(100, 100),
    texture = new Texture();
  const a = {
    layer: createLayer("image", { id: "a" }),
    source: { texture, width: 20, height: 10, premultiplied: false },
  };
  const b = { ...a, layer: { ...a.layer, id: "b" } };
  batch.draw([a], 100, 100, target);
  const scene = fake.render.mock.calls.at(-1)![0] as Scene;
  const materialA = (scene.children[0] as Mesh<PlaneGeometry, MeshBasicNodeMaterial>).material;
  const disposeA = vi.spyOn(materialA, "dispose");
  batch.draw([b], 100, 100, target);
  const materialB = (scene.children[0] as Mesh<PlaneGeometry, MeshBasicNodeMaterial>).material;
  const disposeB = vi.spyOn(materialB, "dispose");
  const live = { has: vi.fn((id: string) => ["a", "b", "not-drawn"].includes(id)) };
  batch.retain(live);
  expect(disposeA).not.toHaveBeenCalled();
  expect(disposeB).not.toHaveBeenCalled();
  expect(live.has).toHaveBeenCalledTimes(2);
  batch.draw([a], 100, 100, target);
  expect((scene.children[0] as Mesh).material).toBe(materialA);
  batch.retain(new Map([["b", true]]));
  expect(disposeA).toHaveBeenCalledOnce();
  expect(scene.children).toHaveLength(0);
  batch.dispose();
  expect(disposeB).toHaveBeenCalledOnce();
  target.dispose();
  texture.dispose();
});

it("places a cropped transport quad within the current parent viewport", () => {
  const { renderer, fake } = makeGpuRenderer(),
    batch = new NormalBatch(renderer);
  const layer = createLayer("group", { x: 100, y: 80, width: 300, height: 200, rotation: 90 });
  const target = new RenderTarget(32, 32),
    texture = new Texture();
  batch.draw(
    [
      {
        layer,
        source: {
          texture,
          width: 6,
          height: 12,
          premultiplied: true,
          bounds: { x: 19, y: 29, width: 6, height: 12 },
        },
      },
    ],
    32,
    32,
    target,
    { x: 5, y: 7 },
  );
  const scene = fake.render.mock.calls.at(-1)![0] as Scene;
  const mesh = scene.children[0] as Mesh;
  expect(mesh.position.x).toBeCloseTo(310, 10);
  expect(mesh.position.y).toBeCloseTo(45, 10);
  expect(mesh.scale.toArray()).toEqual([6, -12, 1]);
  expect(mesh.rotation.z).toBeCloseTo(Math.PI / 2);
  expect(layer).toMatchObject({ x: 100, y: 80, width: 300, height: 200 });
  batch.dispose();
  target.dispose();
  texture.dispose();
});

it("prepares actual layer materials once and rebuilds only after a layer is retired", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    batch = new NormalBatch(renderer),
    target = new RenderTarget(1, 1);
  const layers = [
    createLayer("image", { id: "image" }),
    createLayer("rectangle", { id: "primitive" }),
  ];
  await batch.prepare(layers, target);
  expect(fake.compileAsync).toHaveBeenCalledTimes(1);
  await batch.prepare(layers, target);
  expect(fake.compileAsync).toHaveBeenCalledTimes(1);
  expect(batch.passes).toBe(0);
  batch.retain(new Set());
  await batch.prepare(layers, target);
  expect(fake.compileAsync).toHaveBeenCalledTimes(2);
  expect(fake.getRenderTarget()).toBeNull();
  batch.dispose();
  target.dispose();
});
