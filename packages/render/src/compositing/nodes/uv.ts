import type { Texture, Node } from "three/webgpu";
import { mix, uv, vec2 } from "three/tsl";
/** Framebuffer targets use the opposite logical Y orientation from decoded image sources.
 * Apply this once at every sampling boundary; Three adapts backend coordinates internally. */
export function textureFlip(texture: Texture): number {
  return texture.isRenderTargetTexture ? 1 : 0;
}
export function textureUv(flipY: Node<"float">) {
  return vec2(uv().x, mix(uv().y, uv().y.oneMinus(), flipY));
}
