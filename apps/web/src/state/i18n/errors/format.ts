import { i18n } from "..";
import "./messages";

/** Translate stable platform codes while retaining unrecognized failure diagnostics. */
export function formatUiError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "STALE_PROJECT_WRITE"
  )
    return i18n.t("errors:staleProjectWrite");
  return error instanceof Error ? error.message : String(error);
}
