import { expect, it } from "vitest";
import { PrimitivePaintCache } from "../../../src/compositing/primitives/paint-cache";

it("reuses frozen raw RGBA values and isolates paint changes from previous decoded colors", () => {
  const cache = new PrimitivePaintCache(),
    first = cache.read("#1238");
  expect(first.toArray()).toEqual([17 / 255, 34 / 255, 51 / 255, 136 / 255]);
  expect(cache.read("#1238")).toBe(first);
  const changed = cache.read("#123f");
  expect(changed).not.toBe(first);
  expect(changed.w).toBe(1);
  expect(first.w).toBe(136 / 255);
  expect(Object.isFrozen(first)).toBe(true);
  expect(() => first.set(0, 0, 0, 0)).toThrow(TypeError);
  expect(cache.read("transparent").toArray()).toEqual([0, 0, 0, 0]);
});

it("evicts the least recently used key at the entry limit and clears every retained value", () => {
  const cache = new PrimitivePaintCache(2),
    first = cache.read("#111"),
    second = cache.read("#222");
  expect(cache.read("#111")).toBe(first);
  cache.read("#333");
  expect(cache.size).toBe(2);
  expect(cache.read("#111")).toBe(first);
  expect(cache.read("#222")).not.toBe(second);
  expect(cache.bytes).toBe(80);
  cache.clear();
  cache.clear();
  expect(cache.size).toBe(0);
  expect(cache.bytes).toBe(0);
  expect(cache.read("#111")).not.toBe(first);
});

it("bounds decoded payload bytes and never retains an invalid or individually oversized key", () => {
  const cache = new PrimitivePaintCache(128, 80),
    first = cache.read("#111");
  cache.read("#222");
  cache.read("#33333333");
  expect(cache.size).toBe(1);
  expect(cache.bytes).toBe(50);
  expect(cache.read("#111")).not.toBe(first);
  const tooSmall = new PrimitivePaintCache(128, 1);
  expect(tooSmall.read("#fff").x).toBe(1);
  expect(tooSmall.size).toBe(0);
  expect(tooSmall.bytes).toBe(0);
  const previousSize = cache.size,
    previousBytes = cache.bytes;
  expect(() => cache.read("not a color")).toThrow();
  expect(cache.size).toBe(previousSize);
  expect(cache.bytes).toBe(previousBytes);
});

it.each([
  [0, 1],
  [1.5, 1],
  [1, 0],
  [1, Number.POSITIVE_INFINITY],
])("rejects invalid cache budgets %j", (count, bytes) => {
  expect(() => new PrimitivePaintCache(count, bytes)).toThrow("budget");
});
