import { expect, it } from "vitest";
import { FORMAT_VERSION } from "../../src/document/model";
it("pins the portable document format version", () => {
  expect(FORMAT_VERSION).toBe(1);
});
