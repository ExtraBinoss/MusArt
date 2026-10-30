import { useMemo, useSyncExternalStore } from "react";
import {
  getMotionOccurrenceAt,
  listLayerMotionOccurrences,
  type Composition,
  type EnginePort,
} from "@musart/core";
import { getMotionOccurrenceSelection } from "../../../state/motion/occurrence-selection";
import type { TimelineTransport } from "../model";

/** An external presentation store owns its cache outside React render closures. */
function createOccurrenceProjection(
  engine: EnginePort,
  page: Composition,
  transport: TimelineTransport,
) {
  const selection = getMotionOccurrenceSelection(engine);
  let previous: ReadonlyMap<string, string> = new Map();
  return {
    subscribe(this: void, listener: () => void) {
      const stopClock = transport.subscribe(listener),
        stopSelection = selection.subscribe(listener);
      return () => {
        stopClock();
        stopSelection();
      };
    },
    read(this: void) {
      let changed: Map<string, string> | undefined;
      const time = transport.read().time;
      for (const layer of page.layers) {
        const tracks = listLayerMotionOccurrences(page, layer.id);
        const active = getMotionOccurrenceAt(page, layer.id, time, { terminalPreview: true });
        const id = active?.id ?? selection.read(page, layer.id) ?? tracks[0]?.id;
        if (id === previous.get(layer.id)) continue;
        changed ??= new Map(previous);
        if (id) changed.set(layer.id, id);
        else changed.delete(layer.id);
      }
      if (changed) previous = changed;
      return previous;
    },
  };
}

/** Clock ticks publish a new React snapshot only when the chosen occurrence actually changes. */
export function useOccurrenceProjection(
  engine: EnginePort,
  page: Composition,
  transport: TimelineTransport,
) {
  const source = useMemo(
    () => createOccurrenceProjection(engine, page, transport),
    [engine, page, transport],
  );
  return useSyncExternalStore(source.subscribe, source.read, source.read);
}
