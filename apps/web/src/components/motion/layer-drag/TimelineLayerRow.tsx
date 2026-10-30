import { useRef, type ComponentProps } from "react";
import type { TimelineRow } from "../tree";
import { useRowPosition } from "../../layers/rows/use-row-position";
import { DropCue } from "../../layers/drag/DropCue";
import type { TimelineLayerDrag } from "./use-timeline-layer-drag";
import { useRenderMetrics } from "../../../state/session/render-metrics";
type RowDrag = Pick<
  TimelineLayerDrag,
  "page" | "moving" | "target" | "rejected" | "dragging" | "rejectProperty"
> & { native: Pick<TimelineLayerDrag["native"], "over" | "drop"> };

/** Retains each native source in canonical DOM order while only its visual Y position springs. */
export function TimelineLayerRow({
  row,
  top,
  height,
  reduced,
  drag,
  ...props
}: Omit<ComponentProps<"div">, "ref"> & {
  row: TimelineRow;
  top: number;
  height: number;
  reduced: boolean;
  drag?: RowDrag;
}) {
  const node = useRef<HTMLDivElement>(null);
  useRenderMetrics(node);
  useRowPosition(node, `${drag?.page.id ?? ""}:${row.key}`, top, !!drag?.moving, reduced);
  const target = row.kind === "layer" && drag?.target?.id === row.layer.id ? drag.target : null;
  const rejected = drag?.rejected?.id === row.layer.id ? drag.rejected : null;
  return (
    <div
      {...props}
      ref={node}
      style={{ ...props.style, top, height }}
      data-motion-row-key={row.key}
      data-layer-drop-id={row.layer.id}
      data-layer-drop-page-id={drag?.page.id}
      data-layer-drop-kind={row.kind}
      data-layer-reorder-source={
        (row.kind === "layer" && drag?.dragging === row.layer.id) || undefined
      }
      data-layer-reorder-target={target?.position}
      data-layer-reorder-rejected={rejected?.reason}
      onDragOver={
        drag
          ? (event) =>
              row.kind === "layer"
                ? drag.native.over(event, row.layer)
                : drag.rejectProperty(event, row.layer.id)
          : undefined
      }
      onDrop={
        drag
          ? (event) =>
              row.kind === "layer"
                ? drag.native.drop(event, row.layer)
                : drag.rejectProperty(event, row.layer.id)
          : undefined
      }
    >
      {props.children}
      {(target || rejected) && (
        <DropCue anchor={node} position={target?.position} reason={rejected?.reason} />
      )}
    </div>
  );
}
