import { expect, test } from "vitest";
import { formatBytes } from "../../../../src/components/projects/insights/format-bytes";
test("formats logical decimal bytes with real localized storage units and bounded invalid inputs", () => {
  expect(formatBytes(0, "en")).toContain("0");
  expect(formatBytes(-2, "fr")).toContain("0");
  expect(formatBytes(Infinity, "en")).toContain("0");
  expect(formatBytes(0.5, "en")).toContain("1");
  expect(formatBytes(1500, "en")).toContain("1.5");
  expect(formatBytes(1500, "fr")).toContain("1,5");
  expect(formatBytes(1e12, "en")).toContain("TB");
  expect(formatBytes(1e18, "en")).toContain("TB");
});
