import { DynamicDrawUsage, InstancedBufferAttribute, PlaneGeometry } from "three/webgpu";
export const MAX_PRIMITIVE_INSTANCES = 16_384;
export const INSTANCE_BYTES = 120; // matrix64 + fill16 + stroke16 + shape16 + type/opacity8
export const BASE_GEOMETRY_BYTES = 140; // indexed unit plane (position/normal/uv/index)
export function primitiveCapacity(count: number): number {
  if (!Number.isInteger(count) || count < 1) throw new Error("Invalid primitive batch length.");
  return Math.min(MAX_PRIMITIVE_INSTANCES, 2 ** Math.ceil(Math.log2(count)));
}
export function primitiveGeometry(capacity: number) {
  const geometry = new PlaneGeometry(1, 1);
  for (const [name, size] of [
    ["primitiveFill", 4],
    ["primitiveStroke", 4],
    ["primitiveShape", 4],
    ["primitiveKindOpacity", 2],
  ] as const)
    geometry.setAttribute(
      name,
      new InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(
        DynamicDrawUsage,
      ),
    );
  return geometry;
}
