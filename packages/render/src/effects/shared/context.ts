import type { Node, Texture, TextureNode } from "three/webgpu";
import type { EffectUniforms } from "./uniforms";

/** GPU-only inputs. Source pixels and intermediate results never cross this boundary. */
export interface EffectNodeContext {
  readonly source: TextureNode<"vec4">;
  readonly backdrop?: TextureNode<"vec4">;
  readonly controls: EffectUniforms;
  readonly getGlyphAtlas: () => Texture;
}
export type EffectNodeBuilder = (context: EffectNodeContext) => Node<"vec4">;
/** Authored layer dimensions, independent of its current raster density. */
export interface EffectDimensions {
  readonly width: number;
  readonly height: number;
}

import { mix, vec2 } from "three/tsl";
/** UV1 is the logical image top; WebGPU framebuffer textures store their top at UV0. */
export function sampleEffect(
  source: TextureNode<"vec4">,
  controls: EffectUniforms,
  coord: Node<"vec2">,
) {
  return source.sample(vec2(coord.x, mix(coord.y, coord.y.oneMinus(), controls.sourceFlipY)));
}
