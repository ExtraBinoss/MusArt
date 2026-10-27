import { describe, expect, it, vi } from "vitest";
import { Texture } from "three/webgpu";
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
});
