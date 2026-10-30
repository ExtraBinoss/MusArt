import { useCallback, useEffect, useMemo } from "react";
import type { DragEvent } from "react";
import type { Composition, EnginePort } from "@musart/core";
import { useLayerDrag } from "../../layers/drag/use-layer-drag";
import { layerDragController } from "../../layers/drag/controller";
import { layerDragWindow } from "../../layers/drag/window";
import { formatUiError } from "../../../state/i18n/errors/format";
import { createTimelineLayerPointer } from "./pointer";
import type { TimelineGestures } from "../gestures";
import type { TimelineTransport } from "../model";
import { projectTimelineRows, type TimelineRow } from "../tree";

/** Both timeline surfaces project the same engine-owned layer drag as the Layers panel. */
export function useTimelineLayerDrag(options: {
  engine: EnginePort;
  page: Composition;
  collapsed: ReadonlySet<string>;
  transport: TimelineTransport;
  gestures: TimelineGestures;
  active: boolean;
  onError: (message: string) => void;
  chosenOccurrences?: ReadonlyMap<string, string>;
}) {
  const { engine, page, collapsed, transport, gestures, active, onError } = options;
  const run = useCallback(
    (action: () => void) => {
      try {
        action();
      } catch (error) {
        onError(formatUiError(error));
      }
    },
    [onError],
  );
  const { layers, pageId, target, rejected, dragging, cancel, cancelOwned, clearTarget, handlers } =
    useLayerDrag(page, engine, run);
  const native = useMemo(
    () => ({
      layers,
      pageId,
      target,
      rejected,
      dragging,
      cancel,
      cancelOwned,
      clearTarget,
      handlers,
      ...handlers,
    }),
    [layers, pageId, target, rejected, dragging, cancel, cancelOwned, clearTarget, handlers],
  );
  const pointer = useMemo(
    () =>
      createTimelineLayerPointer({
        engine,
        transport,
        compositionId: page.id,
        gestures,
        run,
        onError,
      }),
    [engine, transport, page.id, gestures, run, onError],
  );
  useEffect(() => () => pointer.dispose(), [pointer]);
  useEffect(() => {
    if (!active) {
      pointer.cancel();
      cancelOwned();
    }
  }, [active, pointer, cancelOwned]);
  const canonical = useMemo(
    () => projectTimelineRows(page, collapsed, options.chosenOccurrences),
    [page, collapsed, options.chosenOccurrences],
  );
  const moving = native.dragging !== null && native.pageId === page.id;
  const rows = useMemo(() => {
    if (!moving) return canonical;
    let hidden = collapsed;
    if (native.target?.position === "inside" && collapsed.has(native.target.id)) {
      const next = new Set(collapsed);
      next.delete(native.target.id);
      hidden = next;
    }
    return projectTimelineRows(
      { ...page, layers: native.layers },
      hidden,
      options.chosenOccurrences,
    );
  }, [moving, canonical, page, collapsed, native.layers, native.target, options.chosenOccurrences]);
  const controller = useMemo(() => layerDragController(engine), [engine]);
  const rejectProperty = useCallback(
    (event: DragEvent<HTMLElement>, id: string) => {
      event.stopPropagation();
      event.dataTransfer.dropEffect = "none";
      controller.clear({ id, reason: "property" });
    },
    [controller],
  );
  const window = useCallback(
    (first: number, last: number) => {
      return layerDragWindow<TimelineRow>(
        rows,
        canonical,
        first,
        last,
        moving ? native.dragging : null,
      );
    },
    [rows, canonical, moving, native.dragging],
  );
  return useMemo(
    () => ({
      rows,
      canonical,
      native,
      pointer,
      moving,
      page,
      target: moving ? native.target : null,
      rejected: moving ? native.rejected : null,
      dragging: moving ? native.dragging : null,
      rejectProperty,
      window,
    }),
    [rows, canonical, native, pointer, moving, page, rejectProperty, window],
  );
}

export type TimelineLayerDrag = ReturnType<typeof useTimelineLayerDrag>;
