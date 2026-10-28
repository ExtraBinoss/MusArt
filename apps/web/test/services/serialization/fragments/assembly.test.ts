import { expect, it } from "vitest";
import { FragmentAssembly } from "../../../../src/services/serialization/fragments/assembly";
import { fragmentValue } from "../../../../src/services/serialization/fragments/encode";
import type { FragmentPart } from "../../../../src/services/serialization/fragments/model";

it("reassembles exact nested DTOs and original bytes across bounded fragments", () => {
  const value = {
    nested: Array.from({ length: 130 }, (_, id) => ({
      id,
      children: Array.from({ length: 70 }, (_, n) => n),
      text: "é🙂".repeat(2000),
    })),
    blob: "data:png," + "a".repeat(50000),
  };
  const assembly = new FragmentAssembly();
  for (const part of fragmentValue(value)) assembly.add(structuredClone(part));
  expect(assembly.finish()).toEqual(value);
});

it("rejects missing, duplicate, out-of-order and unsafe fragments", () => {
  const assembly = new FragmentAssembly();
  expect(() => assembly.finish()).toThrow("incomplete");
  expect(() =>
    assembly.add({ type: "string", path: ["name"], offset: 0, total: 2, value: "a" }),
  ).toThrow("order");
  assembly.add({ type: "base", value: { list: [], name: "" } });
  expect(() => assembly.add({ type: "base", value: {} })).toThrow("Duplicate");
  const invalid: FragmentPart[] = [
    { type: "array", path: ["list"], offset: 1, total: 3, value: [1] },
    { type: "array", path: ["list"], offset: 0, total: 3, value: [] },
    { type: "array", path: ["list"], offset: 0, total: 3, value: [1, 2, 3, 4] },
    { type: "string", path: ["__proto__"], offset: 0, total: 1, value: "x" },
    { type: "string", path: ["missing"], offset: 0, total: 1, value: "x" },
    {
      type: "string",
      path: Array.from({ length: 129 }, () => "x"),
      offset: 0,
      total: 1,
      value: "x",
    },
  ];
  for (const part of invalid) expect(() => assembly.add(part)).toThrow();
  assembly.add({ type: "string", path: ["name"], offset: 0, total: 2, value: "a" });
  expect(() => assembly.finish()).toThrow("incomplete");
  expect(() =>
    assembly.add({ type: "string", path: ["name"], offset: 1, total: 3, value: "b" }),
  ).toThrow();
  assembly.add({ type: "string", path: ["name"], offset: 1, total: 2, value: "b" });
  assembly.add({ type: "array", path: ["list"], offset: 0, total: 2, value: [1] });
  expect(() => assembly.finish()).toThrow("incomplete");
  assembly.add({ type: "array", path: ["list"], offset: 1, total: 2, value: [2] });
  expect(assembly.finish()).toEqual({ list: [1, 2], name: "ab" });
});

it("bounds retained input instead of accepting an oversized document", () => {
  const assembly = new FragmentAssembly();
  expect(() =>
    assembly.add({ type: "base", value: { text: "a".repeat(64 * 1024 * 1024) } }),
  ).toThrow("budget");
});

it("roundtrips owned prototype-like field names without traversing inherited properties", () => {
  const value = Object.fromEntries([
    ["__proto__", "x".repeat(12000)],
    ["constructor", { prototype: "y".repeat(2000) }],
  ]);
  const assembly = new FragmentAssembly();
  for (const part of fragmentValue(value)) assembly.add(structuredClone(part));
  expect(assembly.finish()).toEqual(value);
  expect(Object.hasOwn(Object.prototype, "prototype")).toBe(false);
});
