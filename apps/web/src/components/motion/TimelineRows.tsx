import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  Folder,
  Layers,
  Film,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import {
  getEffectDefinition,
  createLayerGeometryIndex,
  motionTimeToSeconds,
  resolveLayerMotionProperty,
  type EnginePort,
  type Layer,
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
import { KeyframeMarker } from "./KeyframeMarker";
import { createTimelineHoverSource } from "../../state/motion/hover";
import "./row-hover.css";
import { TimelineLayerRow } from "./layer-drag/TimelineLayerRow";
import type { TimelineLayerDrag } from "./layer-drag/use-timeline-layer-drag";
import "./layer-drag/layer-drag.css";

const propertyLabels: Readonly<Record<string, string>> = {
  x: "positionX",
  y: "positionY",
  "fillGradient.angle": "gradientAngle",
  "fillGradient.kind": "gradientKind",
};
const layerIcons: Partial<Record<Layer["kind"], LucideIcon>> = {
  group: Folder,
  image: ImageIcon,
  video: Film,
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
  drag,
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
  drag?: TimelineLayerDrag;
}) {
  const { t } = useTranslation("motion"),
    { t: common } = useTranslation();
  const hover = useMemo(() => (engine ? createTimelineHoverSource(engine) : null), [engine]);
  const reduced = !!useReducedMotion();
  const dragPage = drag?.page;
  const geometry = useMemo(
    () => (dragPage ? createLayerGeometryIndex(dragPage) : null),
    [dragPage],
  );
  const hovered = useRef<{ key: string; node: HTMLElement; clear(): void } | null>(null);
  const clearHover = useCallback((key?: string) => {
    const current = hovered.current;
    if (!current || (key !== undefined && current.key !== key)) return;
    hovered.current = null;
    delete current.node.dataset.motionHovered;
    current.clear();
  }, []);
  function showHover(key: string, layerId: string, node: HTMLElement) {
    if (
      hovered.current?.key === key &&
      hovered.current.node === node &&
      (!hover || hover.read()?.layerId === layerId)
    )
      return;
    const clear = hover && compositionId ? hover.show(compositionId, layerId) : () => {};
    clearHover();
    node.dataset.motionHovered = "true";
    hovered.current = { key, node, clear };
  }
  useLayoutEffect(() => {
    if (hovered.current && !hovered.current.node.isConnected) clearHover();
  });
  useEffect(() => () => clearHover(), [clearHover, hover, compositionId]);
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
  const visible = drag
    ? drag.window(first, last)
    : rows.slice(first, last).map((entry, offset) => ({ entry, at: first + offset }));
  return visible.map(({ entry: row, at }) => {
    const Icon = row.kind === "property" ? Diamond : (layerIcons[row.layer.kind] ?? Layers);
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
      <TimelineLayerRow
        key={row.key}
        row={row}
        top={at * rowHeight}
        height={rowHeight}
        reduced={reduced}
        drag={drag}
        className={`motion-row ${active ? "is-selected" : ""} ${row.kind === "property" ? "is-property" : ""}`}
        data-layer-id={row.layer.id}
        data-layer-kind={row.layer.kind}
        data-motion-hover-layer={row.layer.id}
        onPointerEnter={(event) => showHover(row.key, row.layer.id, event.currentTarget)}
        onPointerLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) clearHover(row.key);
        }}
        onFocus={(event) => showHover(row.key, row.layer.id, event.currentTarget)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            clearHover(row.key);
        }}
      >
        <div
          className="motion-row-label"
          style={{ paddingLeft: 10 + row.depth * 14 }}
          draggable={
            !!drag && interactive && row.kind === "layer" && !geometry?.isLocked(row.layer.id)
          }
          onDragStartCapture={
            drag
              ? (event) => {
                  if (!interactive || row.kind !== "layer") {
                    event.preventDefault();
                    return;
                  }
                  clearHover();
                  transport.pause();
                  drag.native.start(event, row.layer, drag.page);
                }
              : undefined
          }
          onDragEndCapture={drag?.native.cancelOwned}
        >
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
          <Icon size={row.kind === "property" ? 10 : 12} aria-hidden />
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
        <div
          className="motion-row-time"
          data-motion-property-id={row.kind === "property" ? row.property.id : undefined}
        >
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
                  if (!row.track) return;
                  if (drag) {
                    clearHover();
                    drag.pointer.begin(event, row.track);
                  } else gestures?.beginTrack(event, row.track, "move");
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
                <KeyframeMarker
                  key={marker.key.id}
                  marker={marker}
                  name={name}
                  propertyId={row.property.id}
                  layerId={row.layer.id}
                  unit={unit}
                  transport={transport}
                  gestures={gestures}
                  onSelect={onSelect}
                  interactive={interactive}
                />
              ),
            )}
        </div>
      </TimelineLayerRow>
    );
  });
}
