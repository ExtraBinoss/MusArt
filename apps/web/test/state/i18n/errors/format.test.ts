import { afterEach, expect, test } from "vitest";
import { changeLanguage } from "../../../../src/state/i18n";
import { formatUiError } from "../../../../src/state/i18n/errors/format";

afterEach(() => changeLanguage("fr"));

test("localizes layout restore/save failures while preserving the storage cause", async () => {
  const cause = new Error("quota denied");
  const error = Object.assign(new Error("diagnostic", { cause }), {
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
  });
  expect(formatUiError(error)).toContain("n’ont pas pu être enregistrés");
  await changeLanguage("en");
  expect(formatUiError(error)).toContain("could not be saved");
  expect(formatUiError({ code: "PROJECT_PREFERENCES_LOAD_FAILED" })).toContain(
    "could not be restored",
  );
  expect(error.cause).toBe(cause);
});

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

test("classifies only named video-source codes, keeps HDR explicit and preserves original diagnostics", async () => {
  const hdr = Object.assign(
    new Error("Native format rejected", { cause: new Error("HDR color conversion unavailable") }),
    { name: "VideoSourceError", code: "unsupported" },
  );
  expect(formatUiError(hdr)).toContain("vidéo HDR");
  expect(hdr.cause).toBeInstanceOf(Error);
  expect(hdr.message).toBe("Native format rejected");
  await changeLanguage("en");
  expect(formatUiError(hdr)).toContain("HDR video needs color conversion");
  for (const [code, phrase] of Object.entries({
    closed: "source was closed",
    superseded: "newer seek",
    aborted: "was canceled",
    unsupported: "browser-supported codec",
    budgetExceeded: "memory or decoder limit",
    decodeFailed: "could not be decoded",
    busy: "finishing another request",
  }))
    expect(formatUiError({ name: "VideoSourceError", code, message: "raw" })).toContain(phrase);
  expect(
    formatUiError({
      name: "StorageError",
      code: "busy",
      message: "actual unrelated busy diagnostic",
    }),
  ).toBe("actual unrelated busy diagnostic");
  expect(
    formatUiError({ name: "VideoSourceError", code: "unknown", message: "future diagnostic" }),
  ).toBe("future diagnostic");
});

test("translates precise media-original/storage/install failures in each language", async () => {
  for (const language of ["fr", "en"] as const) {
    await changeLanguage(language);
    for (const code of [
      "VIDEO_ORIGINAL_MISSING",
      "VIDEO_STORAGE_LIMIT",
      "VIDEO_IMPORT_UNAVAILABLE",
    ]) {
      const error = Object.assign(new Error("raw diagnostic"), { code });
      expect(formatUiError(error)).not.toBe("raw diagnostic");
      expect(formatUiError(error)).not.toContain("errors:");
      expect(error.message).toBe("raw diagnostic");
    }
  }
});

test("explains transparent-video limitations independently from browser codecs or HDR", async () => {
  const error = Object.assign(new Error("GPU alpha adapter unavailable"), {
    name: "VideoSourceError",
    code: "alphaUnsupported",
  });
  expect(formatUiError(error)).toContain("vidéos avec transparence");
  await changeLanguage("en");
  expect(formatUiError(error)).toContain("Transparent video is not supported yet");
  expect(error.message).toBe("GPU alpha adapter unavailable");
  expect(
    formatUiError({ name: "OtherError", code: "alphaUnsupported", message: "unrelated" }),
  ).toBe("unrelated");
});

test("distinguishes transparent export capability from transparent source import", async () => {
  const error = Object.assign(new Error("GPU alpha encoding adapter unavailable"), {
    name: "MotionExportError",
    code: "alphaUnsupported",
  });
  expect(formatUiError(error)).toContain("L’export vidéo avec transparence");
  await changeLanguage("en");
  expect(formatUiError(error)).toContain("Transparent video export is not supported yet");
  expect(error.message).toBe("GPU alpha encoding adapter unavailable");
});
