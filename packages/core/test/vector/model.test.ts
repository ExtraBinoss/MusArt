import { it, expectTypeOf } from "vitest";
import type { VectorDefinition, VectorPart } from "../../src/vector/model";
it("exposes portable Resumi-compatible paths and part transforms", () => {
  expectTypeOf<VectorDefinition>().toHaveProperty("viewBox").toBeString();
  expectTypeOf<VectorPart>()
    .toHaveProperty("matrix")
    .toEqualTypeOf<[number, number, number, number, number, number] | undefined>();
});
