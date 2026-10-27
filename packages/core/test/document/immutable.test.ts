import { it, expect } from "vitest";
import { cloneValue, freezeValue } from "../../src/document/immutable";
it("copies nested structured data without retaining mutable aliases and freezes every node", () => {
  const source = { a: [{ value: 1 }], text: "bytes", nil: null };
  const copy = cloneValue(source);
  copy.a[0]!.value = 2;
  expect(source.a[0]!.value).toBe(1);
  expect(copy.text).toBe(source.text);
  expect(copy.nil).toBeNull();
  const frozen = freezeValue(copy);
  expect(frozen).toBe(copy);
  expect(Object.isFrozen(copy.a[0])).toBe(true);
  expect(() => {
    copy.a.push({ value: 3 });
  }).toThrow();
  expect(freezeValue(copy)).toBe(copy);
  expect(freezeValue(null)).toBeNull();
});
