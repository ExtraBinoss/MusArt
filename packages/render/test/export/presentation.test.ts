import { expect, it } from "vitest";
import { Texture } from "three/webgpu";
import { GpuPresentation } from "../../src/export/presentation";
import { makeGpuRenderer } from "../gpu-fixture";
it("presents the final premultiplied texture directly to the browser framebuffer", () => {
  const { renderer, fake } = makeGpuRenderer();
  const presentation = new GpuPresentation(renderer);
  presentation.render({ texture: new Texture(), width: 300, height: 200, premultiplied: true });
  expect(fake.setSize).toHaveBeenCalledWith(300, 200, false);
  expect(fake.setRenderTarget).toHaveBeenLastCalledWith(null);
  expect(fake.render).toHaveBeenCalledOnce();
  expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  presentation.dispose();
});
