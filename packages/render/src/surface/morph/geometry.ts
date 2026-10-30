import type { Layer } from "@musart/core";
import {
  BufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
} from "three/webgpu";
import type { MorphAtlas } from "./atlas";
/** All instance attributes share one bounded buffer (including on eight-buffer WebGPU devices). */
export function morphGeometry(_layer: Layer, atlas: MorphAtlas) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const fields: [string, number][] = [
    ["glyphBounds", 4],
    ["glyphBands", 2],
    ["glyphRange", 4],
    ["morphRank", 1],
    ["morphMeta", 2],
  ];
  const stride = fields.reduce((n, [, size]) => n + size, 0),
    array = new Float32Array(stride * atlas.shapes.length);
  const buffer = new InstancedInterleavedBuffer(array, stride);
  let offset = 0;
  for (const [name, size] of fields) {
    geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
    offset += size;
  }
  atlas.shapes.forEach((shape, index) => {
    const values = [
      0,
      0,
      1,
      1,
      shape.header,
      16,
      0,
      0,
      1,
      1,
      atlas.shapes.length > 1 ? index / (atlas.shapes.length - 1) : 0,
      shape.metadata,
      shape.frames.length,
    ];
    array.set(values, index * stride);
  });
  geometry.instanceCount = atlas.shapes.length;
  return {
    geometry,
    bytes:
      array.byteLength +
      geometry.getAttribute("position").array.byteLength +
      geometry.getAttribute("uv").array.byteLength +
      geometry.getIndex()!.array.byteLength,
  };
}
