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
  expect(formatUiError({ code: "PIXEL_SELECTION_TOO_LARGE" })).toMatch(
    /^Cette image est trop grande/,
  );
  expect(formatUiError(new Error("adapter lost"))).toBe("adapter lost");
  expect(formatUiError(Object.assign(new Error("real cause"), { code: "toString" }))).toBe(
    "real cause",
  );
  expect(formatUiError("quota")).toBe("quota");
  expect(formatUiError(null)).toBe("null");
  expect(formatUiError(undefined)).toBe("undefined");
  expect(formatUiError(42)).toBe("42");
});

test("translates a lost initialization acknowledgment without hiding its original diagnostic", async () => {
  const error = Object.assign(new Error("worker acknowledgment was lost"), {
    code: "UNCERTAIN_JOURNAL_INITIALIZATION",
  });
  expect(formatUiError(error)).toBe(
    "L’initialisation de l’historique n’a pas pu être confirmée. Vérifiez le projet actuel avant de réessayer.",
  );
  await changeLanguage("en");
  expect(formatUiError(error)).toBe(
    "History initialization could not be confirmed. Check the current project before retrying.",
  );
  expect(error.message).toBe("worker acknowledgment was lost");
});

test("a lost save acknowledgment is localized without claiming a successful write", async () => {
  const error = Object.assign(new Error("save acknowledgment lost"), {
    code: "UNCERTAIN_PROJECT_WRITE",
  });
  expect(formatUiError(error)).toBe(
    "L’enregistrement n’a pas pu être confirmé. Vérifiez le projet sauvegardé avant de réessayer.",
  );
  await changeLanguage("en");
  expect(formatUiError(error)).toBe(
    "Saving could not be confirmed. Check the saved project before retrying.",
  );
});

test("localizes journal backpressure while preserving its diagnostic for troubleshooting", async () => {
  const error = Object.assign(new Error("pending history admission limit exceeded"), {
    code: "JOURNAL_QUEUE_FULL",
  });
  expect(formatUiError(error)).toBe(
    "Trop d’écritures d’historique sont en attente. Attendez la fin, puis réessayez.",
  );
  await changeLanguage("en");
  expect(formatUiError(error)).toBe(
    "History has too many pending writes. Wait for it to finish, then retry.",
  );
  expect(error.message).toBe("pending history admission limit exceeded");
});
