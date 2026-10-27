import { expect, it } from "vitest";
import { RenderTarget, Texture } from "three/webgpu";
import { uniform } from "three/tsl";
import { textureFlip, textureUv } from "../../../src/compositing/nodes/uv";
it("normalizes framebuffer target UV orientation separately from decoded image sources", () => {
  const target = new RenderTarget(2, 2);
  expect(textureFlip(new Texture())).toBe(0);
  expect(textureFlip(target.texture)).toBe(1);
  expect(textureFlip(target.texture)).toBe(1);
  expect(textureUv(uniform(1)).isNode).toBe(true);
  target.dispose();
});
