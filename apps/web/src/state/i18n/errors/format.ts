import { i18n } from "..";
import "./messages";

const platformCodes = {
  STALE_PROJECT_WRITE: "staleProjectWrite",
  UNCERTAIN_JOURNAL_INITIALIZATION: "uncertainJournalInitialization",
  UNCERTAIN_PROJECT_WRITE: "uncertainProjectWrite",
  JOURNAL_QUEUE_FULL: "journalQueueFull",
  PIXEL_SELECTION_TOO_LARGE: "pixelSelectionTooLarge",
  PIXEL_SELECTION_IMAGE_REQUIRED: "pixelSelectionImageRequired",
  VIDEO_ORIGINAL_MISSING: "videoOriginalMissing",
  VIDEO_STORAGE_LIMIT: "videoStorageLimit",
  VIDEO_IMPORT_UNAVAILABLE: "videoImportUnavailable",
} as const;
const videoCodes = {
  closed: "videoClosed",
  superseded: "videoSuperseded",
  aborted: "videoAborted",
  unsupported: "videoUnsupported",
  alphaUnsupported: "videoAlphaUnsupported",
  budgetExceeded: "videoBudgetExceeded",
  decodeFailed: "videoDecodeFailed",
  busy: "videoBusy",
} as const;

function hdrCause(error: object): boolean {
  const visited = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if (visited.has(current)) return false;
    visited.add(current);
    try {
      if (
        "message" in current &&
        typeof current.message === "string" &&
        /\bHDR\b|high.dynamic.range/i.test(current.message)
      )
        return true;
      current = "cause" in current ? current.cause : undefined;
    } catch {
      return false;
    }
  }
  return false;
}

/** Translate stable platform codes while retaining unrecognized failure diagnostics. */
export function formatUiError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "MotionExportError" &&
    "code" in error &&
    error.code === "alphaUnsupported"
  )
    return i18n.t("errors:motionAlphaExportUnsupported");
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "VideoSourceError" &&
    "code" in error &&
    typeof error.code === "string" &&
    Object.hasOwn(videoCodes, error.code)
  )
    return i18n.t(
      `errors:${error.code === "unsupported" && hdrCause(error) ? "videoHdrUnsupported" : videoCodes[error.code as keyof typeof videoCodes]}`,
    );
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    Object.hasOwn(platformCodes, error.code)
  )
    return i18n.t(`errors:${platformCodes[error.code as keyof typeof platformCodes]}`);
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return String(error);
}
