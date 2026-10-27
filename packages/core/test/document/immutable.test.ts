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

it("preserves prototype-looking JSON data as own fields without changing object prototypes", () => {
  const source = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"name":"custom"},"prototype":7}',
  ) as Record<string, unknown>;
  const copy = cloneValue(source);
  expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  expect(Object.hasOwn(copy, "__proto__")).toBe(true);
  expect(copy).toEqual(source);
  expect(copy.__proto__).not.toBe(source.__proto__);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
