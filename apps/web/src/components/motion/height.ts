import type { EnginePort } from "@musart/core";

/** A bounded session fallback; the project's preferences store supplies durable values. */
const proportions = new WeakMap<EnginePort, Map<string, number>>();

export function clampTimelineHeight(height: number, viewportHeight: number): number {
  const available = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 720;
  const value = Number.isFinite(height) ? height : 200;
  return Math.round(Math.max(164, Math.min(Math.max(164, available * 0.65), value)));
}

export function readTimelineHeight(engine: EnginePort, viewportHeight: number): number {
  const ratio = proportions.get(engine)?.get(engine.getSnapshot().project.id);
  const available = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 720;
  const initial = Math.max(200, Math.min(316, available * 0.32));
  return clampTimelineHeight(ratio === undefined ? initial : ratio * available, available);
}

export function rememberTimelineHeight(
  engine: EnginePort,
  height: number,
  viewportHeight: number,
): void {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
  let values = proportions.get(engine);
  if (!values) proportions.set(engine, (values = new Map()));
  const id = engine.getSnapshot().project.id;
  values.delete(id);
  values.set(id, clampTimelineHeight(height, viewportHeight) / viewportHeight);
  if (values.size > 32) values.delete(values.keys().next().value!);
}
