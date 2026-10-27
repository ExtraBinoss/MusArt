import { Matrix3, Texture, type Node } from "three/webgpu";
import {
  Fn,
  clamp,
  dot,
  max,
  min,
  mix,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  texture,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { textureUv } from "../compositing/nodes/uv";
const decode = (rgb: Node<"vec3">) => sRGBTransferEOTF(rgb) as Node<"vec3">;
const encode = (rgb: Node<"vec3">) => sRGBTransferOETF(clamp(rgb, 0, 1)) as Node<"vec3">;
export function colorControls() {
  return {
    source: texture(new Texture()),
    flipY: uniform(0),
    premultiplied: uniform(0),
    mode: uniform(0),
    toP3: uniform(
      new Matrix3().set(
        0.8225929,
        0.17753395,
        0,
        0.03319951,
        0.9667835,
        0,
        0.01708535,
        0.07239572,
        0.91030148,
      ),
    ),
    toSRGB: uniform(
      new Matrix3().set(
        1.224745,
        -0.224904,
        0,
        -0.042058,
        1.042081,
        0,
        -0.019642,
        -0.078655,
        1.098537,
      ),
    ),
  };
}
/** Brand SVG paints are imported sRGB assets even in a Display-P3 working document. */
export function srgbToDisplayP3(rgb: Node<"vec3">) {
  const linear = decode(rgb);
  return encode(
    vec3(
      dot(linear, vec3(0.8225929, 0.17753395, 0)),
      dot(linear, vec3(0.03319951, 0.9667835, 0)),
      dot(linear, vec3(0.01708535, 0.07239572, 0.91030148)),
    ),
  );
}
/** Generic CMYK print simulation: UCR black, 280% TAC, 8% dot gain, warm paper. No ICC claim. */
export function cmykProof(rgb: Node<"vec3">) {
  const cmy = rgb.oneMinus();
  const k = min(min(cmy.r, cmy.g), cmy.b);
  const inks = cmy.sub(k).div(max(k.oneMinus(), 0.000001));
  const gained = clamp(inks.add(inks.mul(inks.oneMinus()).mul(0.08)), 0, 1);
  const total = dot(gained, vec3(1));
  const factor = min(1, max(k.oneMinus().add(1.8), 0).div(max(total, 0.000001)));
  const limited = gained.mul(factor);
  return clamp(
    limited
      .oneMinus()
      .mul(k.mul(0.95).oneMinus())
      .mul(vec3(0.97, 0.955, 0.91))
      .add(0.015),
    0,
    1,
  );
}
export function colorNode(controls: ReturnType<typeof colorControls>) {
  return Fn(() => {
    const sample = controls.source.sample(textureUv(controls.flipY)).toVar();
    const rgb = mix(
      sample.rgb,
      sample.rgb.div(max(sample.a, 0.000001)),
      controls.premultiplied,
    ).toVar();
    const p3 = encode(controls.toP3.mul(decode(rgb)));
    const srgb = encode(controls.toSRGB.mul(decode(rgb)));
    const adjusted = controls.mode
      .equal(1)
      .select(
        p3,
        controls.mode.equal(2).select(srgb, controls.mode.equal(3).select(cmykProof(rgb), rgb)),
      );
    return vec4(mix(adjusted, adjusted.mul(sample.a), controls.premultiplied), sample.a);
  })();
}
