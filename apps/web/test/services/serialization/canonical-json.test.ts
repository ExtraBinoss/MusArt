import { expect, test } from "vitest";
import { canonicalJson } from "../../../src/services/serialization/canonical-json";
const reference = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item)
            .filter(([, value]) => value !== undefined)
            .sort(([a], [b]) => a.localeCompare(b, "en")),
        )
      : item,
  );
test("matches canonical bytes for reordered, repeated and undefined fields without prototype mutation", () => {
  const value = {
    z: null,
    a: [
      { z: 1, a: 2 },
      { z: 3, a: 4 },
    ],
    missing: undefined,
    data: JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"data","prototype":2}',
    ) as unknown,
  };
  expect(canonicalJson(value)).toBe(reference(value));
  expect(canonicalJson(Object.fromEntries(Object.entries(value).reverse()))).toBe(reference(value));
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(canonicalJson(false)).toBe("false");
  expect(canonicalJson([undefined, 1])).toBe("[null,1]");
});
test("retains native behavior after the key-layout cache fills or keys exceed its budget", () => {
  const value = Array.from({ length: 140 }, (_, i) => ({ [`key-${i}`]: i, z: 1 }));
  expect(canonicalJson(value)).toBe(reference(value));
  const large = { ["x".repeat(4100)]: 1 };
  expect(canonicalJson([large, large])).toBe(reference([large, large]));
  expect(() => canonicalJson(undefined)).toThrow("serializable");
  const cyclic: { self?: object } = {};
  cyclic.self = cyclic;
  expect(() => canonicalJson(cyclic)).toThrow();
});
