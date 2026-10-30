import type { EnginePort } from "@musart/core";

interface Origin {
  mode: "static" | "motion";
  input: "native" | "pointer";
  sourceId: string;
}
interface NativeInput {
  defaultPrevented: boolean;
  dataTransfer?: Pick<DataTransfer, "types" | "effectAllowed" | "dropEffect">;
}
/** Rejection evidence only: no asset data, document snapshots or per-pixel console traffic. */
export function createLayerDragDiagnostics() {
  let origin: Origin | null = null;
  const reported = new Set<string>();
  return {
    begin(next: Origin) {
      origin = next;
      reported.clear();
    },
    refuse(stage: string, reason: string, targetId?: string, event?: NativeInput) {
      // A lost session is one failure, even when the pointer crosses many rows afterwards.
      const key = `${stage}:${reason}:${reason === "inactiveDrag" ? "" : (targetId ?? "")}`;
      if (reported.has(key) || reported.size >= 32) return;
      reported.add(key);
      console.warn("[MusArt DnD]", {
        stage,
        reason,
        mode: origin?.mode ?? "unknown",
        input: origin?.input ?? "native",
        sourceIds: origin ? [origin.sourceId] : [],
        targetId: targetId ?? null,
        ...(event
          ? {
              types: Array.from(event.dataTransfer?.types ?? []),
              defaultPrevented: event.defaultPrevented,
              effectAllowed: event.dataTransfer?.effectAllowed ?? null,
              dropEffect: event.dataTransfer?.dropEffect ?? null,
            }
          : {}),
      });
    },
  };
}

const instances = new WeakMap<EnginePort, ReturnType<typeof createLayerDragDiagnostics>>();
export function layerDragDiagnostics(engine: EnginePort) {
  let diagnostics = instances.get(engine);
  if (!diagnostics) {
    diagnostics = createLayerDragDiagnostics();
    instances.set(engine, diagnostics);
  }
  return diagnostics;
}
