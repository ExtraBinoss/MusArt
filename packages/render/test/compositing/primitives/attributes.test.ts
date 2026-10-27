import { expect, it } from "vitest";
import { DynamicDrawUsage, InstancedBufferAttribute } from "three/webgpu";
import {
  BASE_GEOMETRY_BYTES,
  INSTANCE_BYTES,
  MAX_PRIMITIVE_INSTANCES,
  primitiveCapacity,
  primitiveGeometry,
} from "../../../src/compositing/primitives/attributes";
it("bounds power-of-two instance storage and accurately accounts every GPU attribute/index byte", () => {
  expect(primitiveCapacity(1)).toBe(1);
  expect(primitiveCapacity(3)).toBe(4);
  expect(primitiveCapacity(10_000)).toBe(16_384);
  expect(primitiveCapacity(1_000_000)).toBe(MAX_PRIMITIVE_INSTANCES);
  for (const count of [0, -1, 1.5, Infinity]) expect(() => primitiveCapacity(count)).toThrow();
  const geometry = primitiveGeometry(4);
  expect(geometry.getAttribute("primitiveFill")).toBeInstanceOf(InstancedBufferAttribute);
  const fill = geometry.getAttribute("primitiveFill");
  if (!(fill instanceof InstancedBufferAttribute)) throw new Error("Expected instance attribute");
  expect(fill.usage).toBe(DynamicDrawUsage);
  const bytes =
    Object.values(geometry.attributes).reduce((sum, value) => sum + value.array.byteLength, 0) +
    geometry.index!.array.byteLength +
    4 * 16 * 4;
  expect(bytes).toBe(BASE_GEOMETRY_BYTES + INSTANCE_BYTES * 4);
  geometry.dispose();
});
