import { describe, expect, it, vi } from "vitest";
import { Texture, LinearMipmapLinearFilter, NearestFilter } from "three/webgpu";
import { LayerTargets } from "../../src/compositing/targets";
describe("retained per-layer GPU targets", () => {
  it("reuses same-role buffers, resizes only dimensions and owns texture disposal", () => {
    const layer = new LayerTargets();
    const first = layer.target("source", 40, 30);
    expect(layer.target("source", 40, 30)).toBe(first);
    expect(layer.bytes).toBe(4800);
    expect(layer.targets).toBe(1);
    layer.target("source", 50, 30);
    expect(layer.bytes).toBe(6000);
    const texture = new Texture();
    const dispose = vi.spyOn(texture, "dispose");
    layer.setSource(texture, "paint", 400);
    expect(layer.sourceTexture).toBe(texture);
    expect(layer.bytes).toBe(6400);
    layer.setSource(new Texture(), "next", 100);
    expect(dispose).toHaveBeenCalledOnce();
    layer.dispose();
    expect(layer.sourceTexture).toBeNull();
    expect(layer.targets).toBe(0);
    expect(layer.bytes).toBe(0);
  });
  it("owns the complete mip pyramid and projects its exact byte budget before allocation", () => {
    const layer = new LayerTargets();
    expect(layer.projectedBytes("reference", 5, 3, true)).toBe(72);
    const target = layer.target("reference", 5, 3, true);
    expect(target.texture.generateMipmaps).toBe(true);
    expect(target.texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(target.texture.magFilter).toBe(NearestFilter);
    expect(layer.bytes).toBe(72);
    expect(layer.projectedBytes("reference", 9, 5, true)).toBe(224);
    expect(layer.target("reference", 9, 5, true)).toBe(target);
    expect(layer.bytes).toBe(224);
    expect(() => layer.target("reference", 9, 5)).toThrow("filtering policy");
    expect(() => layer.projectedBytes("invalid", Infinity, 2, true)).toThrow("dimensions");
    for (const [width, height] of [
      [1, NaN],
      [0, 1],
      [1, 0],
    ])
      expect(() => layer.projectedBytes("invalid", width!, height!, true)).toThrow("dimensions");
    expect(layer.projectedBytes("tall", 1, 5, true) - layer.bytes).toBe(32);
    layer.dispose();
    expect(layer.bytes).toBe(0);
  });
});
