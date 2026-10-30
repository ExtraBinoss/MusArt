// Weighted ray coverage adapted from Eric Lengyel Slug / diffusionstudio slug-webgpu (MIT).
// Copyright 2017 Eric Lengyel; Copyright (c) 2025 Konstantin Paulus. See docs/legal/slug-*-MIT.txt.
import type { DataTexture } from "three/webgpu";
import {
  Fn,
  Break,
  If,
  Loop,
  abs,
  attribute,
  clamp,
  float,
  floatBitsToUint,
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
} from "three/tsl";
import type { Node } from "three/webgpu";
import { glyphVertex } from "./vertex";
export { glyphPosition } from "./vertex";

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
    const result = float(0).toVar(),
      weight = float(0).toVar();
    // Match the reference sign-bit classification, including signed zero at shared endpoints.
    // Three's BitcastNode typings omit the uint node extensions exposed at runtime.
    const bits = (floatBitsToUint(p0.y) as unknown as Node<"uint">)
      .shiftRight(uint(31))
      .bitOr(
        (floatBitsToUint(p1.y) as unknown as Node<"uint">).shiftRight(uint(30)).bitAnd(uint(2)),
      )
      .bitOr(
        (floatBitsToUint(p2.y) as unknown as Node<"uint">).shiftRight(uint(29)).bitAnd(uint(4)),
      );
    const code = uint(0x2e74).shiftRight(bits).bitAnd(uint(0x0101));
    If(code.notEqual(uint(0)), () => {
      // Hoist shared expressions before either root branch: TSL variables are scope-sensitive.
      // Form coefficients before translating by the fragment position. Otherwise a straight
      // line acquires a tiny spurious quadratic term from float32 cancellation at large sizes.
      const a = raw0.sub(raw1.mul(2)).add(raw2).toVar(),
        b = raw0.sub(raw1).toVar();
      // Both this atlas and the WGSL port use unscaled font-design-unit coordinates.
      const linear = abs(a.y)
        .lessThan(1 / 65536)
        .toVar();
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
      const rayDistance = (t: Node<"float">) =>
        a.x.mul(t).sub(b.x.mul(2)).mul(t).add(p0.x).mul(pixelScale);
      If(code.bitAnd(uint(1)).notEqual(uint(0)), () => {
        const distance = rayDistance(t1).toVar();
        result.addAssign(clamp(distance.add(0.5), 0, 1));
        weight.assign(max(weight, clamp(float(1).sub(abs(distance).mul(2)), 0, 1)));
      });
      If(code.greaterThan(uint(1)), () => {
        const distance = rayDistance(t2).toVar();
        result.subAssign(clamp(distance.add(0.5), 0, 1));
        weight.assign(max(weight, clamp(float(1).sub(abs(distance).mul(2)), 0, 1)));
      });
    });
    return vec2(result, weight);
  },
);

export const glyphCoverage = (atlas: DataTexture, atlasWidth: number, sample?: Node<"vec2">) =>
  Fn(() => {
    const bands = varying(attribute("glyphBands", "vec2"));
    const range = varying(attribute("glyphRange", "vec4"));
    // Header pointers and band transforms are constant per glyph, as in Slug's flat varyings.
    bands.setInterpolation("flat");
    range.setInterpolation("flat");
    const coordinate = sample ?? glyphVertex().coordinate;
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
        const accumulated = float(0).toVar(),
          weight = float(0).toVar();
        Loop({ start: int(0), end: int(header.y), type: "int", condition: "<" }, ({ i }) => {
          const pointer = int(fetch(int(header.x).add(i)).x);
          const first = fetch(pointer),
            last = fetch(pointer.add(1));
          const along0 = vertical ? first.y : first.x,
            along1 = vertical ? first.w : first.z,
            along2 = vertical ? last.y : last.x,
            point = vertical ? coordinate.y : coordinate.x,
            scale = vertical ? pixelScale.y : pixelScale.x;
          If(max(max(along0, along1), along2).sub(point).mul(scale).lessThan(-0.5), () => {
            Break();
          });
          const ray = traceCurve(
            vertical ? first.yx : first.xy,
            vertical ? first.wz : first.zw,
            vertical ? last.yx : last.xy,
            vertical ? coordinate.yx : coordinate,
            scale,
          ).toVar();
          accumulated.addAssign(vertical ? ray.x.negate() : ray.x);
          weight.assign(max(weight, ray.y));
        });
        return vec2(accumulated, weight);
      })();
    const horizontal = coverage(false).toVar(),
      vertical = coverage(true).toVar();
    const weighted = abs(horizontal.x.mul(horizontal.y).add(vertical.x.mul(vertical.y))).div(
      max(horizontal.y.add(vertical.y), 1 / 65536),
    );
    return clamp(max(weighted, min(abs(horizontal.x), abs(vertical.x))), 0, 1);
  })();
