import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
import { InterleavedBufferAttribute } from "three/webgpu";
import { buildMorphAtlas } from "../../../src/surface/morph/atlas";
import { morphGeometry } from "../../../src/surface/morph/geometry";
import { morphFixture } from "../../morph-fixture";
test("uses one instance buffer with exact retained byte accounting", () => {
  const atlas = buildMorphAtlas(morphFixture());
  const { geometry, bytes } = morphGeometry(createLayer("text"), atlas);
  const instances = Object.values(geometry.attributes).filter(
    (attribute) => attribute instanceof InterleavedBufferAttribute,
  );
  expect(new Set(instances.map((attribute) => attribute.data)).size).toBe(1);
  expect(geometry.instanceCount).toBe(1);
  const buffers = new Set(
    Object.values(geometry.attributes).map((attribute) =>
      attribute instanceof InterleavedBufferAttribute ? attribute.data.array : attribute.array,
    ),
  );
  expect(bytes).toBe(
    [...buffers].reduce(
      (total, array) => total + array.byteLength,
      geometry.getIndex()!.array.byteLength,
    ),
  );
  geometry.dispose();
  atlas.texture.dispose();
});
