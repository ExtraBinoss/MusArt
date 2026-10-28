import { afterEach, expect, test } from "vitest";
import { changeLanguage } from "../../../../src/state/i18n";
import { formatUiError } from "../../../../src/state/i18n/errors/format";

afterEach(() => changeLanguage("fr"));

test("formats stable storage codes in the current language without importing the store", async () => {
  const error = Object.assign(new Error("diagnostic"), { code: "STALE_PROJECT_WRITE" });
  expect(formatUiError(error)).toMatch(/^Ce projet a changé/);
  await changeLanguage("en");
  expect(formatUiError(error)).toMatch(/^This project changed/);
  expect(error.message).toBe("diagnostic");
  expect(formatUiError({ code: "STALE_PROJECT_WRITE" })).toMatch(/^This project changed/);
});

test("preserves unknown diagnostic messages and non-Error failures", () => {
  expect(formatUiError(new Error("adapter lost"))).toBe("adapter lost");
  expect(formatUiError(Object.assign(new Error("real cause"), { code: "toString" }))).toBe(
    "real cause",
  );
  expect(formatUiError("quota")).toBe("quota");
  expect(formatUiError(null)).toBe("null");
  expect(formatUiError(undefined)).toBe("undefined");
  expect(formatUiError(42)).toBe("42");
});
