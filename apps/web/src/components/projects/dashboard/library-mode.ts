import { useCallback, useState } from "react";
import type { ProjectSummary } from "../../../state/contracts";

export type LibraryMode = "all" | "static" | "motion";
export const LIBRARY_MODE_KEY = "musart.library-mode.v1";
export function isLibraryMode(value: unknown): value is LibraryMode {
  return value === "all" || value === "static" || value === "motion";
}
export function readLibraryMode(): LibraryMode {
  try {
    const value = localStorage.getItem(LIBRARY_MODE_KEY);
    return isLibraryMode(value) ? value : "all";
  } catch {
    return "all";
  }
}
/** A user preference shared by both library sections, separate from project data and history. */
export function useLibraryMode() {
  const [mode, update] = useState<LibraryMode>(readLibraryMode);
  const setMode = useCallback((value: LibraryMode) => {
    update(value);
    try {
      localStorage.setItem(LIBRARY_MODE_KEY, value);
    } catch {
      /* The filter remains usable when preference storage is blocked. */
    }
  }, []);
  return [mode, setMode] as const;
}
export function projectLibraryMode(project: ProjectSummary): Exclude<LibraryMode, "all"> {
  return (
    project.mode ?? (project.pages.some((page) => page.mode === "motion") ? "motion" : "static")
  );
}
