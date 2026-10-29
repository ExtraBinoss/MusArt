import type { EnginePort } from "@musart/core";

/** Session presentation preferences never enter project data, undo or the edit journal. */
const proportions = new WeakMap<EnginePort, number>();

export function clampTimelineHeight(height: number, viewportHeight: number): number {
  const available = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 720;
  const value = Number.isFinite(height) ? height : 200;
  return Math.round(Math.max(164, Math.min(Math.max(164, available * 0.65), value)));
}

export function readTimelineHeight(engine: EnginePort, viewportHeight: number): number {
  const ratio = proportions.get(engine);
  const available = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 720;
  const initial = Math.max(200, Math.min(316, available * 0.32));
  return clampTimelineHeight(ratio === undefined ? initial : ratio * available, available);
}

export function rememberTimelineHeight(
  engine: EnginePort,
  height: number,
  viewportHeight: number,
): void {
  if (Number.isFinite(viewportHeight) && viewportHeight > 0)
    proportions.set(engine, clampTimelineHeight(height, viewportHeight) / viewportHeight);
}
