import { BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry } from "three/webgpu";
import type { Layer } from "@musart/core";
import type { CurveAtlas } from "./atlas";
import type { PlacedGlyph } from "./layout";

export function glyphGeometry(
  layer: Layer,
  layout: PlacedGlyph[],
  atlas: CurveAtlas,
  unitsPerEm: number,
): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const positions: number[] = [],
    bounds: number[] = [],
    bands: number[] = [],
    ranges: number[] = [];
  const scale = layer.fontSize / unitsPerEm,
    padding = (4 * unitsPerEm) / layer.fontSize;
  for (const { glyph, x, baseline } of layout) {
    const record = atlas.glyphs.get(glyph.index)!;
    const [gx, gy, width, height] = record.bounds;
    if (width <= 0 || height <= 0) continue;
    positions.push(
      x + (gx - padding) * scale,
      baseline + (gy - padding) * scale,
      (width + padding * 2) * scale,
      (height + padding * 2) * scale,
    );
    bounds.push(gx - padding, gy - padding, width + padding * 2, height + padding * 2);
    bands.push(record.header, record.bands);
    ranges.push(gx, gy, width, height);
  }
  geometry.setAttribute(
    "glyphPosition",
    new InstancedBufferAttribute(new Float32Array(positions), 4),
  );
  geometry.setAttribute("glyphBounds", new InstancedBufferAttribute(new Float32Array(bounds), 4));
  geometry.setAttribute("glyphBands", new InstancedBufferAttribute(new Float32Array(bands), 2));
  geometry.setAttribute("glyphRange", new InstancedBufferAttribute(new Float32Array(ranges), 4));
  geometry.instanceCount = positions.length / 4;
  return geometry;
}
