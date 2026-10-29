import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import {
  Matrix3,
  Mesh,
  MeshBasicNodeMaterial,
  RenderTarget,
  Texture,
  Vector2,
  type Scene,
} from "three/webgpu";
import { graphNodes } from "../effects/node-fixture";
import { GpuPasses } from "../../src/compositing/passes";
import { makeGpuRenderer } from "../gpu-fixture";
afterEach(() => vi.restoreAllMocks());
describe("GPU-only compositing operators", () => {
  it("maps a cropped nonnormal source in the current parent target coordinates", () => {
    const { renderer, fake } = makeGpuRenderer(),
      passes = new GpuPasses(renderer),
      target = new RenderTarget(10, 10);
    const source = {
      texture: new Texture(),
      width: 4,
      height: 5,
      premultiplied: true,
      bounds: { x: 3, y: 2, width: 4, height: 5 },
    };
    passes.blendTo(
      new Texture(),
      source,
      createLayer("group", { x: 20, y: 30, width: 100, height: 100, blendMode: "multiply" }),
      10,
      10,
      target,
      { x: 10, y: 15 },
    );
    const mesh = (fake.render.mock.calls[0]![0] as Scene).children[0] as Mesh;
    const nodes = graphNodes((mesh.material as MeshBasicNodeMaterial).fragmentNode!);
    const values = [...nodes].flatMap((node) => ("value" in node ? [node.value] : []));
    expect(values.some((value) => value instanceof Vector2 && value.x === 4 && value.y === 5)).toBe(
      true,
    );
    expect(
      values.some(
        (value) =>
          value instanceof Matrix3 && value.elements[6] === -13 && value.elements[7] === -17,
      ),
    ).toBe(true);
    passes.dispose();
    target.dispose();
    source.texture.dispose();
  });
  it("submits clear/copy/shapes/masks/blends without reading pixels and restores shared state", () => {
    const { renderer, fake } = makeGpuRenderer();
    const passes = new GpuPasses(renderer);
    const prior = new RenderTarget(2, 2);
    const output = new RenderTarget(40, 30);
    fake.setRenderTarget(prior);
    const source = { texture: new Texture(), width: 40, height: 30, premultiplied: false };
    passes.clear(output, "#ff000080");
    passes.copyTo(source, output);
    passes.copyTo(source, null, true);
    passes.copyTo(source, output, false, true);
    for (const premultiplied of [false, true])
      for (const inverted of [false, true])
        passes.maskTo({ ...source, premultiplied }, new Texture(), inverted, output);
    passes.shapeTo(createLayer("rectangle"), 2, output);
    for (const blendMode of ["multiply", "screen", "overlay"] as const)
      passes.blendTo(
        new Texture(),
        source,
        createLayer("rectangle", { blendMode }),
        200,
        100,
        output,
      );
    expect(passes.passes).toBe(12);
    expect(fake.getRenderTarget()).toBe(prior);
    expect(fake.autoClear).toBe(true);
    expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
    passes.dispose();
  });
  it("restores render target and autoClear when GPU submission throws", () => {
    const { renderer, fake } = makeGpuRenderer();
    const passes = new GpuPasses(renderer);
    fake.render.mockImplementationOnce(() => {
      throw new Error("device lost");
    });
    expect(() => passes.clear(new RenderTarget(2, 2))).toThrow("device lost");
    expect(fake.getRenderTarget()).toBeNull();
    expect(fake.autoClear).toBe(true);
    expect(passes.passes).toBe(0);
    passes.dispose();
  });
});

it("prepares reusable pass materials asynchronously without drawing or retaining render state", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    passes = new GpuPasses(renderer),
    target = new RenderTarget(1, 1);
  await passes.prepare(target);
  const count = fake.compileAsync.mock.calls.length;
  expect(count).toBe(5);
  expect(fake.render).not.toHaveBeenCalled();
  await passes.prepare(target);
  expect(fake.compileAsync).toHaveBeenCalledTimes(count);
  expect(fake.getRenderTarget()).toBeNull();
  passes.dispose();
  target.dispose();
});
