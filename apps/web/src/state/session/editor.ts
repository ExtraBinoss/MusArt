import { useCallback, useSyncExternalStore } from "react";
import { atom } from "jotai";
import type { EnginePort, SessionSnapshot } from "@musart/core";
import type { PreviewValue } from "./preview-source";
import type { Tool } from "../../canvas/EditorCanvas";
import type { SelectionMode } from "../../services/selection/wand/model";

export const toolAtom = atom<Tool>("pointer");
export const previewAtom = atom<PreviewValue | null>(null);
export const toleranceAtom = atom(32);
export const selectionModeAtom = atom<SelectionMode>("new");
export const selectionContiguousAtom = atom(true);
export { applyTheme, readTheme, themeAtom, useTheme, type Theme } from "./theme";
export function useEngine(engine: EnginePort) {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
/** Select immutable references or cached projections so unrelated session updates stay local. */
export function useEngineValue<T>(engine: EnginePort, select: (snapshot: SessionSnapshot) => T) {
  const read = useCallback(() => select(engine.getSnapshot()), [engine, select]);
  return useSyncExternalStore(engine.subscribe, read, read);
}
