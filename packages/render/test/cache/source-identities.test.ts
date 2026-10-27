import { expect, test } from "vitest";
import { SourceIdentities } from "../../src/cache/source-identities";

test("retains stable identities while eviction never recycles an old identity", () => {
  const identities = new SourceIdentities(2);
  const first = identities.intern("a");
  const second = identities.intern("b");
  expect(identities.intern("a")).toBe(first);
  identities.intern("c");
  expect(identities.intern("a")).toBe(first);
  const renewed = identities.intern("b");
  expect(renewed).not.toBe(second);
  expect(renewed).not.toBe(first);
  expect(identities.stats().entries).toBe(2);
});

test("bounds signature payloads by bytes and declines individually oversized values", () => {
  const identities = new SourceIdentities(10, 40);
  const first = identities.intern("abcdefgh");
  identities.intern("ijklmnop");
  expect(identities.stats().entries).toBe(1);
  expect(identities.stats().bytes).toBeLessThanOrEqual(40);
  expect(identities.intern("abcdefgh")).not.toBe(first);
  const oversized = "x".repeat(40);
  expect(identities.intern(oversized)).not.toBe(identities.intern(oversized));
  expect(identities.stats().entries).toBe(1);
  for (const args of [
    [0, 20],
    [1, 0],
    [1.5, 20],
    [1, Infinity],
  ])
    expect(() => new SourceIdentities(args[0], args[1])).toThrow("budget");
});
