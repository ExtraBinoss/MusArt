import { it, expectTypeOf } from "vitest";
import type { ReplayEvent, ReplayState, ReplaySpec, ReplayDelta } from "../../src/animation/model";
it("keeps originals outside event states and defines millisecond time", () => {
  expectTypeOf<ReplayEvent>().toHaveProperty("at").toBeNumber();
  expectTypeOf<ReplayState>().toHaveProperty("assetIds").toEqualTypeOf<string[]>();
  expectTypeOf<ReplaySpec>().toHaveProperty("version").toEqualTypeOf<1>();
  expectTypeOf<ReplayDelta["op"]>().toEqualTypeOf<"set" | "insert" | "remove" | "move">();
});
