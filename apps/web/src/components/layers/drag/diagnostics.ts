import type { EnginePort } from "@musart/core";
import { createDragDiagnostics } from "../../shared/dnd/diagnostics";
export const createLayerDragDiagnostics = createDragDiagnostics;
const instances = new WeakMap<EnginePort, ReturnType<typeof createLayerDragDiagnostics>>();
export function layerDragDiagnostics(engine: EnginePort) {
  let diagnostics = instances.get(engine);
  if (!diagnostics) {
    diagnostics = createLayerDragDiagnostics();
    instances.set(engine, diagnostics);
  }
  return diagnostics;
}
