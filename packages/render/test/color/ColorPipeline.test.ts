import { expect, it, vi } from "vitest";
import { RenderTarget, Texture, Mesh, MeshBasicNodeMaterial } from "three/webgpu";
import { ColorPipeline } from "../../src/color/ColorPipeline";
import { makeGpuRenderer } from "../gpu-fixture";
it("reuses one color material and restores the renderer on conversion success and errors", () => {
  const { renderer, fake } = makeGpuRenderer(),
    pipeline = new ColorPipeline(renderer);
  const target = new RenderTarget(8, 8),
    old = new RenderTarget(2, 2);
  fake.setRenderTarget(old);
  const source = { texture: new Texture(), width: 8, height: 8, premultiplied: false };
  for (const mode of ["to-p3", "to-srgb", "cmyk-proof"] as const)
    pipeline.render(source, target, mode);
  expect(pipeline.passes).toBe(3);
  expect(renderer.getRenderTarget()).toBe(old);
  expect(renderer.autoClear).toBe(true);
  const scene = fake.render.mock.calls[0]![0],
    mesh = scene.children[0] as Mesh;
  const material = mesh.material as MeshBasicNodeMaterial;
  const dispose = vi.spyOn(material, "dispose");
  fake.render.mockImplementationOnce(() => {
    throw new Error("lost");
  });
  expect(() =>
    pipeline.render(
      { ...source, texture: target.texture, premultiplied: true },
      target,
      "cmyk-proof",
    ),
  ).toThrow("lost");
  expect(renderer.getRenderTarget()).toBe(old);
  pipeline.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  target.dispose();
  old.dispose();
  source.texture.dispose();
});
