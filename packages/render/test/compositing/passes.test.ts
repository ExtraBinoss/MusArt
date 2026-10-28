import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { RenderTarget, Texture } from "three/webgpu";
import { GpuPasses } from "../../src/compositing/passes";
import { makeGpuRenderer } from "../gpu-fixture";
afterEach(() => vi.restoreAllMocks());
describe("GPU-only compositing operators", () => {
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
