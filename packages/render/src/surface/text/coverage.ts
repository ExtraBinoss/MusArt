import type { DataTexture } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  attribute,
  clamp,
  float,
  floor,
  fwidth,
  int,
  ivec2,
  max,
  min,
  sqrt,
  textureLoad,
  uint,
  varying,
  vec2,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";

/** Signed analytic quadratic-ray coverage, adapted from ts-slug into portable TSL. */
const traceCurve = Fn(
  ([raw0, raw1, raw2, point, pixelScale]: [
    Node<"vec2">,
    Node<"vec2">,
    Node<"vec2">,
    Node<"vec2">,
    Node<"float">,
  ]) => {
    const p0 = raw0.sub(point).toVar(),
      p1 = raw1.sub(point).toVar(),
      p2 = raw2.sub(point).toVar();
    const result = float(0).toVar();
    const bits = uint(p0.y.greaterThan(0).select(2, 0))
      .add(p1.y.greaterThan(0).select(uint(4), uint(0)))
      .add(p2.y.greaterThan(0).select(uint(8), uint(0)));
    const code = uint(0x2e74).shiftRight(bits).bitAnd(uint(3));
    If(code.notEqual(uint(0)), () => {
      // Hoist shared expressions before either root branch: TSL variables are scope-sensitive.
      // Form coefficients before translating by the fragment position. Otherwise a straight
      // line acquires a tiny spurious quadratic term from float32 cancellation at large sizes.
      const a = raw0.sub(raw1.mul(2)).add(raw2).toVar(),
        b = raw0.sub(raw1).toVar();
      const epsilon = max(max(abs(raw0.y), abs(raw1.y)), max(abs(raw2.y), 1))
        .mul(0.000001)
        .toVar();
      const linear = abs(a.y).lessThanEqual(epsilon).toVar();
      const ay = linear.select(float(1), a.y).toVar();
      const by = abs(b.y).lessThan(0.000001).select(float(1), b.y).toVar();
      const discriminant = b.y.mul(b.y).sub(a.y.mul(p0.y)).toVar();
      const root = sqrt(max(discriminant, 0)).toVar();
      const positive = b.y.greaterThanEqual(0).toVar();
      const q = positive.select(b.y.add(root), b.y.sub(root)).toVar();
      const safeQ = abs(q).lessThan(0.000001).select(float(1), q).toVar();
      const near = p0.y.div(safeQ).toVar(),
        far = q.div(ay).toVar();
      const repeated = b.y.div(ay).toVar();
      const t1 = linear
        .select(
          p0.y.div(by.mul(2)),
          discriminant.lessThanEqual(0).select(repeated, positive.select(near, far)),
        )
        .toVar();
      const t2 = linear
        .select(t1, discriminant.lessThanEqual(0).select(repeated, positive.select(far, near)))
        .toVar();
      const rayCoverage = (t: Node<"float">) =>
        clamp(a.x.mul(t).sub(b.x.mul(2)).mul(t).add(p0.x).mul(pixelScale).add(0.5), 0, 1);
      If(code.bitAnd(uint(1)).notEqual(uint(0)), () => {
        result.addAssign(rayCoverage(t1));
      });
      If(code.greaterThan(uint(1)), () => {
        result.subAssign(rayCoverage(t2));
      });
    });
    return result;
  },
);

export const glyphCoverage = (atlas: DataTexture, atlasWidth: number) =>
  Fn(() => {
    const bounds = varying(attribute("glyphBounds", "vec4"));
    const bands = varying(attribute("glyphBands", "vec2"));
    const range = varying(attribute("glyphRange", "vec4"));
    const coordinate = varying(attribute("uv", "vec2").mul(bounds.zw).add(bounds.xy));
    const pixelScale = max(fwidth(coordinate), vec2(0.000001)).reciprocal().toVar();
    const fetch = (index: Node<"int">) =>
      textureLoad(atlas, ivec2(index.mod(int(atlasWidth)), index.div(int(atlasWidth))));
    const coverage = (vertical: boolean) =>
      Fn(() => {
        const position = vertical ? coordinate.x : coordinate.y,
          origin = vertical ? range.x : range.y,
          span = vertical ? range.z : range.w;
        const index = int(
          clamp(
            floor(position.sub(origin).div(max(span, 0.000001)).mul(bands.y)),
            0,
            bands.y.sub(1),
          ),
        );
        const header = fetch(
          int(bands.x)
            .add(vertical ? int(bands.y) : int(0))
            .add(index),
        );
        const accumulated = float(0).toVar();
        Loop({ start: int(0), end: int(header.y), type: "int", condition: "<" }, ({ i }) => {
          const pointer = int(fetch(int(header.x).add(i)).x);
          const first = fetch(pointer),
            last = fetch(pointer.add(1));
          accumulated.addAssign(
            traceCurve(
              vertical ? first.yx : first.xy,
              vertical ? first.wz : first.zw,
              vertical ? last.yx : last.xy,
              vertical ? coordinate.yx : coordinate,
              vertical ? pixelScale.y : pixelScale.x,
            ),
          );
        });
        return min(abs(accumulated), 1);
      })();
    return coverage(false).add(coverage(true)).mul(0.5);
  })();
export function glyphPosition() {
  const placement = attribute("glyphPosition", "vec4"),
    local = attribute("uv", "vec2");
  return vec4(local.mul(placement.zw).add(placement.xy), 0, 1).xyz;
}
