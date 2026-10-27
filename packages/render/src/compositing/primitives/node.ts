import { attribute, vec4 } from "three/tsl";
import { shapeNode } from "../../surface/shapes";
/** Three carries instanced attributes to the fragment stage for both WGSL and GLSL. */
export function primitiveNode() {
  const shape = attribute("primitiveShape", "vec4"),
    kindOpacity = attribute("primitiveKindOpacity", "vec2");
  const color = shapeNode({
    size: shape.xy,
    radius: shape.z,
    strokeWidth: shape.w,
    ellipse: kindOpacity.x,
    fill: attribute("primitiveFill", "vec4"),
    stroke: attribute("primitiveStroke", "vec4"),
  });
  return vec4(color.rgb, color.a.mul(kindOpacity.y));
}
