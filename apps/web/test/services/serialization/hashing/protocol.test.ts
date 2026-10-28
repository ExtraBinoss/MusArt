import { expect, test } from "vitest";
import { isHashResponse } from "../../../../src/services/serialization/hashing/protocol";

test("accepts only durable IDs with SHA-256 values or explicit failures", () => {
  expect(isHashResponse({ id: 1, value: "a".repeat(64) })).toBe(true);
  expect(isHashResponse({ id: 2, error: "Rejected" })).toBe(true);
  for (const value of [
    null,
    "hash",
    {},
    { id: 0, error: "x" },
    { id: 1.1, error: "x" },
    { id: 1, value: "short" },
    { id: 1, value: "A".repeat(64) },
  ])
    expect(isHashResponse(value)).toBe(false);
});
