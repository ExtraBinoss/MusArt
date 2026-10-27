import { expectTypeOf, test } from "vitest";
import type { VectorDefinition } from "@musart/core";
import type { CatalogAsset, VectorArtwork } from "../src/types";
test("catalog artwork is structurally portable into the core document", () => {
  expectTypeOf<VectorArtwork>().toExtend<VectorDefinition>();
  expectTypeOf<CatalogAsset>().toExtend<VectorArtwork>();
});
