import { it, expect } from "vitest";
import {
  assertRecord,
  assertText,
  assertNumber,
  assertBoolean,
  assertColor,
  assertList,
  assertUniqueId,
} from "../../src/document/guards";
it("validates scalar boundaries and globally unique identifiers", () => {
  assertRecord({});
  assertText("ok");
  assertNumber(1, 0, 1);
  assertBoolean(false);
  assertColor("#1234");
  assertColor("transparent");
  assertList([], 0);
  const ids = new Set<string>();
  assertUniqueId("one", ids);
  expect(ids.has("one")).toBe(true);
  for (const run of [
    () => assertRecord([]),
    () => assertText(""),
    () => assertText("ab", 1),
    () => assertNumber(NaN, 0, 1),
    () => assertNumber("1", 0, 1),
    () => assertBoolean(1),
    () => assertColor("red"),
    () => assertList([1], 0),
    () => assertUniqueId("one", ids),
  ])
    expect(run).toThrow();
});
