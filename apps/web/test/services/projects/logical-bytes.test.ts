import { it, expect } from "vitest";
import { logicalBytes } from "../../../src/services/projects/logical-bytes";
it("counts logical UTF-8 JSON including Unicode without conflating UTF-16 code units or native storage overhead", () => {
  expect(logicalBytes({ name: "é🎨" })).toBe(new TextEncoder().encode('{"name":"é🎨"}').byteLength);
  expect(logicalBytes(undefined)).toBe(0);
  expect(logicalBytes(null)).toBe(4);
  expect(logicalBytes("a")).toBe(3);
});
