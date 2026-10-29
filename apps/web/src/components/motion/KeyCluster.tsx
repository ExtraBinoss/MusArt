import { useRef, useState } from "react";
import { Diamond, ScanSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motionTimeToSeconds, type MotionKeyframe } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { useVirtualList } from "../shared/scroll/use-virtual-list";
import type { TimelineGestures } from "./gestures";
import type { TimelineTransport, TimelineUnit } from "./model";
import { formatTimelineTime } from "./time";
import "./messages";
import "./key-cluster.css";

interface ClusterProps {
  keys: readonly MotionKeyframe[];
  first: number;
  after: number;
  propertyId: string;
  name: string;
  x: number;
  unit: TimelineUnit;
  gestures?: TimelineGestures;
  transport: TimelineTransport;
  onSelectLayer: (additive: boolean) => void;
  onZoomRange?: (start: number, end: number) => void;
}
function containsSelection(props: ClusterProps) {
  const selected = props.gestures?.readSelected();
  if (!selected?.size) return false;
  for (let index = props.first; index < props.after; index++)
    if (selected.has(props.keys[index]!.id)) return true;
  return false;
}

/** Dense buckets always expose their real stored keys in a bounded, accessible list. */
export function KeyCluster(props: ClusterProps) {
  const { t } = useTranslation("motion");
  const [open, setOpen] = useState(false);
  const key = props.keys[props.first]!;
  const count = props.after - props.first;
  const selected = containsSelection(props);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`motion-key is-bundle ${selected ? "is-key-selected" : ""}`}
          data-key-id={key.id}
          data-property-id={props.propertyId}
          data-first-key-index={props.first}
          data-after-key-index={props.after}
          aria-pressed={selected}
          style={{ left: props.x }}
          aria-label={t("expandKeyCluster", { name: props.name, count })}
        >
          <Diamond size={8} aria-hidden />
        </button>
      </PopoverTrigger>
      {open && (
        <PopoverContent
          className="motion-key-cluster"
          side="top"
          align="start"
          aria-label={t("clusterTitle", { count })}
          data-canvas-control
          data-keybinding-capture
          onKeyDown={(event) => {
            if ((event.key === "Delete" || event.key === "Backspace") && props.gestures) {
              event.preventDefault();
              event.stopPropagation();
              props.gestures.deleteSelected();
              setOpen(false);
            }
          }}
        >
          <header>
            <strong>{t("clusterTitle", { count })}</strong>
            <span>{props.name}</span>
          </header>
          <ClusterList {...props} />
          <footer>
            {props.gestures && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  props.gestures!.selectKeys(
                    props.keys.slice(props.first, props.after).map((item) => item.id),
                    true,
                  )
                }
              >
                {t("selectCluster")}
              </Button>
            )}
            {props.onZoomRange && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  props.onZoomRange!(
                    motionTimeToSeconds(key.time),
                    motionTimeToSeconds(props.keys[props.after - 1]!.time),
                  );
                  setOpen(false);
                }}
              >
                <ScanSearch size={12} />
                {t("zoomCluster")}
              </Button>
            )}
          </footer>
        </PopoverContent>
      )}
    </Popover>
  );
}

function ClusterList(props: ClusterProps) {
  const { t } = useTranslation("motion");
  const viewport = useRef<HTMLDivElement>(null);
  const count = props.after - props.first;
  const virtual = useVirtualList(count, 28, viewport, 2);
  return (
    <div
      className="motion-cluster-scroll"
      ref={viewport}
      style={{ height: Math.min(180, count * 28) }}
      onScroll={virtual.onScroll}
      role="list"
      aria-label={t("clusterTitle", { count })}
      tabIndex={0}
    >
      <div style={{ height: virtual.height, position: "relative" }}>
        {Array.from({ length: Math.max(0, virtual.last - virtual.first) }, (_, offset) => {
          const index = props.first + virtual.first + offset,
            key = props.keys[index]!;
          const time = formatTimelineTime(key.time, props.unit);
          return (
            <div
              role="listitem"
              key={key.id}
              className="motion-cluster-entry"
              style={{ top: (virtual.first + offset) * 28 }}
            >
              <button
                type="button"
                aria-pressed={props.gestures?.readSelected().has(key.id) ?? false}
                aria-label={t("clusterKey", { number: index + 1, time, unit: props.unit })}
                onClick={(event) => {
                  props.gestures?.selectKey(key.id, event.shiftKey);
                  props.onSelectLayer(event.shiftKey);
                  props.transport.pause();
                  props.transport.seek(key.time);
                }}
              >
                <Diamond size={10} aria-hidden />
                <span>
                  {time} {props.unit}
                </span>
                <small>#{index + 1}</small>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
