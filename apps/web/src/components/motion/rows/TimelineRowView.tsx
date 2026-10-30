import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  Folder,
  Layers,
  Film,
  Image as ImageIcon,
  Spline,
  type LucideIcon,
} from "lucide-react";
import {
  getEffectDefinition,
  resolveLayerMotionProperty,
  type Composition,
  type EnginePort,
  type Layer,
  type MotionPropertyTarget,
  type Project,
} from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "../model";
import { projectEasingSegments, projectKeyMarkers, type TimelineRow } from "../tree";
import { EasingPopover } from "../easing/EasingPopover";
import { formatTimelineTime } from "../time";
import type { TimelineGestures } from "../gestures";
import { KeyCluster } from "../KeyCluster";
import { KeyframeMarker } from "../KeyframeMarker";
import { TimelineLayerName } from "../TimelineLayerName";
import { TrackClips } from "../occurrences/TrackClips";
import { TimelineMotionAction } from "./TimelineMotionAction";
import { TransitionPopover } from "../transitions/TransitionPopover";
import { TimelineLayerRow } from "../layer-drag/TimelineLayerRow";
import type { TimelineLayerDrag } from "../layer-drag/use-timeline-layer-drag";
import "../messages";

export interface TimelineRowViewProps {
  row: TimelineRow;
  top: number;
  height: number;
  reduced: boolean;
  active: boolean;
  locked: boolean;
  page?: Composition;
  /** Project ownership changes must rebind leaves even if a caller reuses the same page. */
  project?: Project;
  pixelsPerSecond: number;
  duration: number;
  left: number;
  width: number;
  unit: TimelineUnit;
  transport: TimelineTransport;
  onToggle(this: void, id: string): void;
  onSelect(this: void, id: string, additive: boolean): void;
  gestures?: TimelineGestures;
  engine?: EnginePort;
  compositionId?: string;
  onError?: (this: void, message: string) => void;
  onZoomRange?: (this: void, start: number, end: number) => void;
  interactive: boolean;
  drag?: TimelineLayerDrag;
  /** The shared temporal canvas paints and picks all content outside the HTML gutter. */
  labelsOnly?: boolean;
  /** Immutable gesture selection identity invalidates marker descendants after a key selection. */
  keySelection?: ReadonlySet<string>;
  showHover(this: void, key: string, layerId: string, node: HTMLElement): void;
  clearHover(this: void, key?: string): void;
}
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

/** Retain expensive Radix/clip/key subtrees while a vertical window only admits adjacent rows. */
export const TimelineRowView = memo(function TimelineRowView(props: TimelineRowViewProps) {
  // keySelection deliberately remains a shallow memo dependency; key children read the gesture port.
  const {
    row,
    top,
    height,
    reduced,
    active,
    locked,
    page,
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
    onError,
    onZoomRange,
    interactive,
    drag,
    labelsOnly = false,
    showHover,
    clearHover,
  } = props;
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
  const MotionAction = labelsOnly ? TimelineMotionAction : TransitionPopover;
  const Icon = row.kind === "property" ? Diamond : (layerIcons[row.layer.kind] ?? Layers);
  const name = row.kind === "property" ? propertyName(row.property.target, row) : row.layer.name;
  const easingAvailable =
    !labelsOnly &&
    row.kind === "property" &&
    interactive &&
    !!engine &&
    !!compositionId &&
    resolveLayerMotionProperty(row.layer, row.property.target)?.interpolation === "continuous";
  return (
    <TimelineLayerRow
      key={row.key}
      row={row}
      top={top}
      height={height}
      reduced={reduced}
      drag={drag}
      className={`motion-row ${active ? "is-selected" : ""} ${row.kind === "property" ? "is-property" : ""}`}
      data-layer-id={row.layer.id}
      data-layer-kind={row.layer.kind}
      data-labels-only={labelsOnly || undefined}
      data-motion-property-id={labelsOnly && row.kind === "property" ? row.property.id : undefined}
      style={labelsOnly ? { pointerEvents: "none" } : undefined}
      data-motion-hover-layer={row.layer.id}
      onPointerEnter={(event) => showHover(row.key, row.layer.id, event.currentTarget)}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) clearHover(row.key);
      }}
      onFocus={(event) => showHover(row.key, row.layer.id, event.currentTarget)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearHover(row.key);
      }}
    >
      <div
        className="motion-row-label"
        style={{ paddingLeft: 10 + row.depth * 14, pointerEvents: labelsOnly ? "auto" : undefined }}
        draggable={!!drag && interactive && row.kind === "layer" && !locked}
        onDragStartCapture={
          drag
            ? (event) => {
                if (
                  !interactive ||
                  row.kind !== "layer" ||
                  (event.target instanceof Element &&
                    event.target.closest("input,textarea,[contenteditable]"))
                ) {
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
        {row.kind === "layer" && engine && compositionId ? (
          <TimelineLayerName
            engine={engine}
            compositionId={compositionId}
            layerId={row.layer.id}
            name={name}
            label={t("selectLayer", { name })}
            interactive={interactive}
            onSelect={(additive) => onSelect(row.layer.id, additive)}
          />
        ) : (
          <button
            type="button"
            className="motion-row-name"
            disabled={!interactive}
            aria-label={t(row.kind === "property" ? "selectPropertyKeys" : "selectLayer", {
              name,
            })}
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
        )}
        {row.kind === "layer" && engine && compositionId && (
          <MotionAction
            engine={engine}
            compositionId={compositionId}
            layerId={row.layer.id}
            trackId={row.track?.id}
            transport={transport}
            disabled={!interactive || !row.track}
          />
        )}
      </div>
      {!labelsOnly && (
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
          {row.kind === "layer" && (
            <TrackClips
              page={page}
              engine={engine}
              layerId={row.layer.id}
              name={name}
              tracks={row.occurrences ?? (row.track ? [row.track] : [])}
              chosenId={row.track?.id}
              duration={duration}
              unit={unit}
              scale={pixelsPerSecond}
              disabled={!interactive || !!locked || row.layer.locked}
              gestures={gestures}
              drag={drag}
              transport={transport}
              onSelect={onSelect}
              onError={onError}
            />
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
      )}
    </TimelineLayerRow>
  );
});
