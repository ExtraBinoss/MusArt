import { i18n } from "..";
import "./messages";

const platformCodes = {
  STALE_PROJECT_WRITE: "staleProjectWrite",
  UNCERTAIN_JOURNAL_INITIALIZATION: "uncertainJournalInitialization",
  UNCERTAIN_PROJECT_WRITE: "uncertainProjectWrite",
  JOURNAL_QUEUE_FULL: "journalQueueFull",
  PIXEL_SELECTION_TOO_LARGE: "pixelSelectionTooLarge",
  PIXEL_SELECTION_IMAGE_REQUIRED: "pixelSelectionImageRequired",
} as const;

/** Translate stable platform codes while retaining unrecognized failure diagnostics. */
export function formatUiError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    Object.hasOwn(platformCodes, error.code)
  )
    return i18n.t(`errors:${platformCodes[error.code as keyof typeof platformCodes]}`);
  return error instanceof Error ? error.message : String(error);
}
