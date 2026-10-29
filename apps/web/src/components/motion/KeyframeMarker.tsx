import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { TimelineGestures } from "./gestures";
import type { TimelineTransport, TimelineUnit } from "./model";
import { formatTimelineTime } from "./time";
import type { projectKeyMarkers } from "./tree";

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
  const selected = gestures?.readSelected().has(marker.key.id) ?? false;
  const label = t(marker.count > 1 ? "keys" : "key", {
    name,
    count: marker.count,
    time: formatTimelineTime(marker.key.time, unit),
    unit,
  });
  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
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
          >
            <Diamond size={8} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
