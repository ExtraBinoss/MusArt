import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Diamond, Folder, Layers } from "lucide-react";
import {
  getEffectDefinition,
  motionTimeToSeconds,
  resolveLayerMotionProperty,
  type EnginePort,
  type MotionPropertyTarget,
} from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "./model";
import { projectEasingSegments, projectKeyMarkers, type TimelineRow } from "./tree";
import { EasingPopover } from "./easing/EasingPopover";
import { Spline } from "lucide-react";
import { formatTimelineTime } from "./time";
import "./messages";
import type { TimelineGestures } from "./gestures";
import { KeyCluster } from "./KeyCluster";

const propertyLabels: Readonly<Record<string, string>> = {
  x: "positionX",
  y: "positionY",
  "fillGradient.angle": "gradientAngle",
  "fillGradient.kind": "gradientKind",
};

export function TimelineRows({
  rows,
  first,
  last,
  rowHeight,
  selected,
  pixelsPerSecond,
  duration,
  left,
  width,
  unit,
  transport,
  onToggle,
  onSelect,
  gestures,
  engine,
  compositionId,
  onZoomRange,
  interactive = true,
}: {
  rows: readonly TimelineRow[];
  first: number;
  last: number;
  rowHeight: number;
  selected: ReadonlySet<string>;
  pixelsPerSecond: number;
  duration: number;
  left: number;
  width: number;
  unit: TimelineUnit;
  transport: TimelineTransport;
  onToggle: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  gestures?: TimelineGestures;
  engine?: EnginePort;
  compositionId?: string;
  onZoomRange?: (start: number, end: number) => void;
  interactive?: boolean;
}) {
  const { t } = useTranslation("motion"),
    { t: common } = useTranslation();
  function propertyName(target: MotionPropertyTarget, row: TimelineRow): string {
    if (target.kind === "layer") return t(propertyLabels[target.property] ?? target.property);
    const effect = row.layer.effects.find((item) => item.id === target.effectId);
    if (!effect) return target.property;
    const definition = getEffectDefinition(effect.type);
    const parameter = definition.parameters.find(
      (item) =>
        item.key === target.property &&
        (item.scope === "settings") === (target.kind === "effectSetting"),
    );
    return `${common(definition.nameKey)} · ${parameter ? common(parameter.labelKey) : t(target.property)}`;
  }
  return rows.slice(first, last).map((row, offset) => {
    const active = selected.has(row.layer.id);
    const name = row.kind === "property" ? propertyName(row.property.target, row) : row.layer.name;
    const start = row.track ? motionTimeToSeconds(row.track.start) : 0;
    const end = row.track?.end ? motionTimeToSeconds(row.track.end) : duration;
    const from = Math.max(0, start),
      to = Math.min(duration, end);
    const easingAvailable =
      row.kind === "property" &&
      interactive &&
      !!engine &&
      !!compositionId &&
      resolveLayerMotionProperty(row.layer, row.property.target)?.interpolation === "continuous";
    return (
      <div
        key={row.key}
        className={`motion-row ${active ? "is-selected" : ""} ${row.kind === "property" ? "is-property" : ""}`}
        style={{ top: (first + offset) * rowHeight, height: rowHeight }}
        data-layer-id={row.layer.id}
      >
        <div className="motion-row-label" style={{ paddingLeft: 10 + row.depth * 14 }}>
          {row.kind === "layer" && row.expandable ? (
            <button
              type="button"
              className="motion-row-expand"
              disabled={!interactive}
              aria-expanded={row.expanded}
              aria-label={t(row.expanded ? "collapse" : "expand", { name: row.layer.name })}
              onClick={() => onToggle(row.layer.id)}
            >
              {row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="motion-row-expand" aria-hidden />
          )}
          {row.kind === "property" ? (
            <Diamond size={10} aria-hidden />
          ) : row.layer.kind === "group" ? (
            <Folder size={12} aria-hidden />
          ) : (
            <Layers size={12} aria-hidden />
          )}
          <button
            type="button"
            className="motion-row-name"
            disabled={!interactive}
            aria-label={t(row.kind === "property" ? "selectPropertyKeys" : "selectLayer", { name })}
            title={name}
            onClick={(event) => {
              if (row.kind === "property")
                gestures?.selectKeys(
                  row.property.keyframes.map((key) => key.id),
                  event.shiftKey,
                );
              onSelect(row.layer.id, event.shiftKey);
            }}
          >
            {name}
          </button>
        </div>
        <div className="motion-row-time">
          {row.kind === "property" &&
            easingAvailable &&
            projectEasingSegments(row.property.keyframes, left, width, pixelsPerSecond).map(
              (segment) => (
                <EasingPopover
                  key={segment.destination.id}
                  engine={engine!}
                  compositionId={compositionId!}
                  property={row.property}
                  destination={segment.destination}
                >
                  <button
                    type="button"
                    className="motion-easing-segment"
                    style={{ left: segment.left + 6, width: Math.max(1, segment.width - 12) }}
                    aria-label={common("motionEasing:edit", {
                      name: `${name} · ${formatTimelineTime(segment.destination.time, unit)} ${unit}`,
                    })}
                  >
                    <Spline size={11} aria-hidden />
                  </button>
                </EasingPopover>
              ),
            )}
          {row.kind === "layer" && to > from && (
            <div
              className="motion-track-wrap"
              data-track-id={row.track?.id}
              style={{
                left: `var(--motion-trim-left, ${from * pixelsPerSecond}px)`,
                width: `var(--motion-trim-width, ${Math.max(2, (to - from) * pixelsPerSecond)}px)`,
              }}
            >
              <button
                type="button"
                className="motion-track"
                disabled={!interactive}
                aria-label={t("track", { name })}
                onPointerDown={(event) => {
                  if (row.track) gestures?.beginTrack(event, row.track, "move");
                }}
                onClick={(event) => {
                  if (gestures?.consumePointerClick(event.detail) || (gestures && event.detail > 0))
                    return;
                  onSelect(row.layer.id, event.shiftKey);
                }}
              >
                <i />
                <i />
              </button>
              {gestures && row.track && (
                <>
                  <button
                    type="button"
                    className="motion-trim-handle is-start"
                    aria-label={t("trimStart", { name })}
                    disabled={row.layer.locked}
                    onPointerDown={(event) => gestures.beginTrack(event, row.track!, "trimStart")}
                  />
                  <button
                    type="button"
                    className="motion-trim-handle is-end"
                    aria-label={t("trimEnd", { name })}
                    disabled={row.layer.locked}
                    onPointerDown={(event) => gestures.beginTrack(event, row.track!, "trimEnd")}
                  />
                </>
              )}
            </div>
          )}
          {row.kind === "property" &&
            projectKeyMarkers(row.property.keyframes, left, width, pixelsPerSecond).map((marker) =>
              marker.count > 1 && interactive ? (
                <KeyCluster
                  key={marker.key.id}
                  keys={row.property.keyframes}
                  first={marker.firstKeyIndex}
                  after={marker.afterKeyIndex}
                  propertyId={row.property.id}
                  name={name}
                  x={marker.x}
                  unit={unit}
                  gestures={gestures}
                  transport={transport}
                  onSelectLayer={(additive) => onSelect(row.layer.id, additive)}
                  onZoomRange={onZoomRange}
                />
              ) : (
                <button
                  type="button"
                  key={marker.key.id}
                  className={`motion-key ${marker.count > 1 ? "is-bundle" : ""} ${gestures?.readSelected().has(marker.key.id) ? "is-key-selected" : ""}`}
                  disabled={!interactive}
                  data-key-id={marker.key.id}
                  data-property-id={row.property.id}
                  data-first-key-index={marker.firstKeyIndex}
                  data-after-key-index={marker.afterKeyIndex}
                  aria-pressed={gestures?.readSelected().has(marker.key.id) ?? false}
                  style={{ left: marker.x }}
                  aria-label={t(marker.count > 1 ? "keys" : "key", {
                    name,
                    count: marker.count,
                    time: formatTimelineTime(marker.key.time, unit),
                    unit,
                  })}
                  onPointerDown={(event) => gestures?.beginKey(event, row.layer.id, marker.key)}
                  onClick={(event) => {
                    if (gestures?.consumePointerClick(event.detail)) return;
                    if (!gestures || event.detail === 0) {
                      gestures?.selectKey(marker.key.id, event.shiftKey);
                      onSelect(row.layer.id, event.shiftKey);
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
              ),
            )}
        </div>
      </div>
    );
  });
}
