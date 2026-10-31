import { expect, it } from "vitest";
import {
  ARRAY_CHUNK_ITEMS,
  fragmentValue,
  STRING_CHUNK_CHARS,
} from "../../../../src/services/serialization/fragments/encode";

it("visits long arrays lazily and bounds nested strings without walking future layers", () => {
  let reads = 0;
  const layers = Array.from({ length: 10000 }, (_, id) => ({
    get id() {
      reads++;
      return id;
    },
    name: "x".repeat(2000),
  }));
  const fragments = fragmentValue({ layers, original: "a".repeat(100000) });
  expect(fragments.next().value).toEqual({ type: "base", value: { layers: [], original: "" } });
  expect(reads).toBe(0);
  expect(fragments.next().value).toMatchObject({ type: "array", offset: 0, total: 10000 });
  expect(reads).toBeLessThanOrEqual(ARRAY_CHUNK_ITEMS);
  const rest = [...fragments];
  for (const part of rest) {
    if (part.type === "array") expect(part.value.length).toBeLessThanOrEqual(ARRAY_CHUNK_ITEMS);
    if (part.type === "string") expect(part.value.length).toBeLessThanOrEqual(STRING_CHUNK_CHARS);
  }
  expect(reads).toBe(10000);
});

it("preserves small arrays, nulls, unicode and own object fields", () => {
  const value = {
    array: [null, true, 2, "é🙂"],
    empty: [],
    own: JSON.parse('{"__proto__":"plain"}') as unknown,
  };
  const parts = [...fragmentValue(value)];
  expect(parts).toEqual([{ type: "base", value }]);
  expect(Object.getPrototypeOf((parts[0] as { value: typeof value }).value.own)).toBe(
    Object.prototype,
  );
});

it("bounds nested vectors and rejects a structurally oversized inline object", () => {
  const vectors = Array.from({ length: 64 }, () => ({
    parts: Array.from({ length: 64 }, () => ({ path: "M".repeat(1024), fill: "#ffffff" })),
  }));
  const parts = [...fragmentValue({ vectors })];
  for (const part of parts) expect(JSON.stringify(part).length).toBeLessThan(40000);
  expect(parts.length).toBeGreaterThan(64);
  const largeObject = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [i, "x".repeat(1000)]),
  );
  expect(() => [...fragmentValue(largeObject)]).toThrow("transport budget");
});

it("reuses unchanged immutable leaf shapes and still defers nested nonempty values", () => {
  const layer = Object.freeze({
    id: "layer",
    x: 4,
    fill: "#abcdef",
    effects: Object.freeze([]),
    padding: Object.freeze({ left: 4, right: 4 }),
  });
  const parts = [...fragmentValue(Object.freeze({ layers: Object.freeze([layer, layer]) }))];
  const array = parts.find((part) => part.type === "array");
  expect(array?.type).toBe("array");
  if (array?.type !== "array") throw Error("Expected layer fragment");
  expect(array.value[0]).toBe(layer);
  const nested = Object.freeze({ layers: Object.freeze([layer]), text: "x".repeat(5000) });
  const base = [...fragmentValue({ nested })][0]!;
  expect(base.type === "base" && (base.value as { nested: unknown }).nested).not.toBe(nested);
});

it("packs morph coordinate pairs without a task per point and preserves exact bounded reconstruction", async () => {
  const { FragmentAssembly } =
    await import("../../../../src/services/serialization/fragments/assembly");
  const input = {
    contours: [{ points: Array.from({ length: 20000 }, (_, i) => [i / 20000, (i % 7) / 7]) }],
  };
  const parts = [...fragmentValue(input)];
  expect(parts.length).toBeLessThan(330);
  const assembly = new FragmentAssembly();
  for (const part of parts) {
    expect(JSON.stringify(part).length).toBeLessThan(32768);
    assembly.add(structuredClone(part));
  }
  expect(assembly.finish()).toEqual(input);
});

it("falls back to fragments when several short scalar arrays fill one object's byte budget", async () => {
  const { FragmentAssembly } =
    await import("../../../../src/services/serialization/fragments/assembly");
  const input = {
    values: Object.fromEntries(Array.from({ length: 700 }, (_, i) => [i, [i, i + 1]])),
  };
  const parts = [...fragmentValue(input)];
  const assembly = new FragmentAssembly();
  for (const part of parts) assembly.add(structuredClone(part));
  expect(parts.length).toBeGreaterThan(1);
  expect(assembly.finish()).toEqual(input);
});
