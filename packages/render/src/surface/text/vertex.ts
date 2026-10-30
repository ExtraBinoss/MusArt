// Dynamic dilation adapted to Three TSL from Eric Lengyel's Slug and diffusionstudio/slug-webgpu.
// Copyright 2017 Eric Lengyel; Copyright (c) 2025 Konstantin Paulus. MIT, see docs/legal/slug-*-MIT.txt.
import {
  Fn,
  abs,
  attribute,
  cameraProjectionMatrix,
  dot,
  max,
  modelViewMatrix,
  normalize,
  sqrt,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from "three/tsl";

/** Expand each corner in actual framebuffer pixels, not cached layer-space pixels. */
export function glyphPosition() {
  return Fn(() => {
    const placement = attribute("glyphPosition", "vec4"),
      uv = attribute("uv", "vec2");
    const point = uv.mul(placement.zw).add(placement.xy).toVar();
    const direction = uv.mul(2).sub(1).toVar(),
      normal = normalize(direction).toVar();
    const mvp = cameraProjectionMatrix.mul(modelViewMatrix).toVar();
    const clip = mvp.mul(vec4(point, 0, 1)).toVar();
    const projectedNormal = mvp.mul(vec4(normal, 0, 0)).toVar();
    const s = clip.w.toVar(),
      t = projectedNormal.w.toVar();
    const projected = projectedNormal.xy.mul(s).sub(clip.xy.mul(t)).mul(viewportSize).toVar();
    // Rationalized Slug factor: s²(st+|uv|)/(|uv|²-(st)²) = s²/(|uv|-st).
    // The guarded form also keeps collapsed/near-plane transforms finite.
    const length = sqrt(max(dot(projected, projected), 1e-24)).toVar();
    const factor = s.mul(s).div(max(length.sub(s.mul(t)), 1e-12));
    // Rounded target extents can be anisotropic. Match the half-pixel box footprint
    // used by fwidth, including rotated/sheared affine transforms, not only the diagonal normal.
    const xAxis = mvp.mul(vec4(1, 0, 0, 0)).toVar(),
      yAxis = mvp.mul(vec4(0, 1, 0, 0)).toVar();
    const denominator = max(s.mul(s).mul(2), 1e-12).toVar();
    const dx = xAxis.xy.mul(s).sub(clip.xy.mul(xAxis.w)).mul(viewportSize).div(denominator).toVar();
    const dy = yAxis.xy.mul(s).sub(clip.xy.mul(yAxis.w)).mul(viewportSize).div(denominator).toVar();
    const determinant = max(abs(dx.x.mul(dy.y).sub(dx.y.mul(dy.x))), 1e-12).toVar();
    const footprint = vec2(abs(dy.x).add(abs(dy.y)), abs(dx.x).add(abs(dx.y))).div(
      determinant.mul(2),
    );
    const delta = direction.mul(max(vec2(factor), footprint));
    return vec3(point.add(delta), 0);
  })();
}

/** Coverage and paint must interpolate the same dilated point as the rendered quad. */
export function glyphVertex() {
  const position = glyphPosition().toVar();
  const placement = attribute("glyphPosition", "vec4"),
    bounds = attribute("glyphBounds", "vec4");
  const coordinate = position.xy
    .sub(placement.xy)
    .div(max(placement.zw, vec2(1e-12)))
    .mul(bounds.zw)
    .add(bounds.xy);
  return { position, coordinate: varying(coordinate), pixel: varying(position.xy) };
}
