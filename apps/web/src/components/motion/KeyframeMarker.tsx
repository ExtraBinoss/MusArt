import { Diamond } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { TimelineGestures } from "./gestures";
import type { TimelineTransport, TimelineUnit } from "./model";
import { formatTimelineTime } from "./time";
import type { projectKeyMarkers } from "./tree";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { captureKeyframeDelete } from "./keyframe-actions";

/** Tooltips mount only for visible markers; pointer movement stays outside React. */
export function KeyframeMarker({
  marker,
  name,
  propertyId,
  layerId,
  unit,
  transport,
  gestures,
  onSelect,
  interactive = true,
}: {
  marker: ReturnType<typeof projectKeyMarkers>[number];
  name: string;
  propertyId: string;
  layerId: string;
  unit: TimelineUnit;
  transport: TimelineTransport;
  gestures?: TimelineGestures;
  onSelect: (id: string, additive: boolean) => void;
  interactive?: boolean;
}) {
  const { t } = useTranslation("motion");
  const remove = useRef<(() => void) | null>(null);
  const [deleteCount, setDeleteCount] = useState(1);
  function prepareDelete() {
    return gestures && interactive
      ? captureKeyframeDelete(gestures, marker.key.id, () => onSelect(layerId, false))
      : null;
  }
  const selected = gestures?.readSelected().has(marker.key.id) ?? false;
  const label = t(marker.count > 1 ? "keys" : "key", {
    name,
    count: marker.count,
    time: formatTimelineTime(marker.key.time, unit),
    unit,
  });
  return (
    <ContextMenu
      modal={false}
      onOpenChange={(open) => {
        const captured = open ? prepareDelete() : null;
        remove.current = captured;
        if (captured) setDeleteCount(captured.count);
      }}
    >
      <TooltipProvider delayDuration={500} skipDelayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <ContextMenuTrigger asChild disabled={!interactive || !gestures}>
              <button
                type="button"
                className={`motion-key ${marker.count > 1 ? "is-bundle" : ""} ${selected ? "is-key-selected" : ""}`}
                disabled={!interactive}
                data-key-id={marker.key.id}
                data-property-id={propertyId}
                data-first-key-index={marker.firstKeyIndex}
                data-after-key-index={marker.afterKeyIndex}
                aria-pressed={selected}
                style={{ left: marker.x }}
                aria-label={label}
                onPointerDown={(event) => gestures?.beginKey(event, layerId, marker.key)}
                onClick={(event) => {
                  if (gestures?.consumePointerClick(event.detail)) return;
                  if (!gestures || event.detail === 0) {
                    gestures?.selectKey(marker.key.id, event.shiftKey);
                    onSelect(layerId, event.shiftKey);
                  }
                  if (event.detail === 0) {
                    transport.pause();
                    transport.seek(marker.key.time);
                  }
                }}
                onDoubleClick={() => {
                  transport.pause();
                  transport.seek(marker.key.time);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Delete" && event.key !== "Backspace") return;
                  if (!interactive || !gestures) return;
                  event.preventDefault();
                  event.stopPropagation();
                  prepareDelete()?.();
                }}
              >
                <Diamond size={8} aria-hidden />
              </button>
            </ContextMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span>{name}</span>
            {" · "}
            <span
              data-motion-key-tooltip={marker.key.id}
              data-time-unit={unit}
              className="inline-block min-w-[7ch] tabular-nums"
            >
              {formatTimelineTime(marker.key.time, unit)} {unit}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ContextMenuContent
        data-canvas-control
        data-keybinding-capture
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            remove.current?.();
          }
        }}
      >
        <ContextMenuItem variant="destructive" onSelect={() => remove.current?.()}>
          {t("deleteKeyframes", { count: deleteCount })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
