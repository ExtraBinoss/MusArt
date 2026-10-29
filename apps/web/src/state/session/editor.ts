import { useCallback, useEffect, useSyncExternalStore } from "react";
import { atom, useAtomValue } from "jotai";
import type { EnginePort, SessionSnapshot } from "@musart/core";
import type { PreviewValue } from "./preview-source";
import type { Tool } from "../../canvas/EditorCanvas";
import type { SelectionMode } from "../../services/selection/wand/model";

export const toolAtom = atom<Tool>("pointer");
export const previewAtom = atom<PreviewValue | null>(null);
export const toleranceAtom = atom(32);
export const selectionModeAtom = atom<SelectionMode>("new");
export const selectionContiguousAtom = atom(true);
export type Theme = "system" | "light" | "dark";
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("musart.theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}
export const themeAtom = atom<Theme>(readTheme());
export function useTheme() {
  const theme = useAtomValue(themeAtom);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
}
export function useEngine(engine: EnginePort) {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
/** Select immutable references or cached projections so unrelated session updates stay local. */
export function useEngineValue<T>(engine: EnginePort, select: (snapshot: SessionSnapshot) => T) {
  const read = useCallback(() => select(engine.getSnapshot()), [engine, select]);
  return useSyncExternalStore(engine.subscribe, read, read);
}
export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem("musart.theme", theme);
  } catch {
    /* Editing remains available with blocked storage. */
  }
}
