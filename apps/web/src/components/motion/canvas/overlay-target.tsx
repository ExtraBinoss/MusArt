import { motionTimeToSeconds, getEffectDefinition } from "@musart/core";
import { Spline } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EasingPopover } from "../easing/EasingPopover";
import { KeyframeMarker } from "../KeyframeMarker";
import { KeyCluster } from "../KeyCluster";
import { TrackClips } from "../occurrences/TrackClips";
import { formatTimelineTime } from "../time";
import { AudioCanvasTarget } from "./AudioCanvasTarget";
import type { CanvasTimelineTargetProps } from "./overlay-model";

/** A single transparent semantic target bridges native input to the existing typed authoring UI. */
export function CanvasTimelineTarget(props: CanvasTimelineTargetProps) {
  const { t } = useTranslation("motion"),
    { t: common } = useTranslation();
  const model = props.model ?? props.host.readModel(),
    hit = props.hit;
  if (hit.kind === "audio" || hit.kind === "audioTrimStart" || hit.kind === "audioTrimEnd")
    return <AudioCanvasTarget {...props} />;
  const rowIndex =
    model.rows[hit.rowIndex]?.key === hit.rowKey
      ? hit.rowIndex
      : model.rows.findIndex((row) => row.key === hit.rowKey);
  const row = model.rows[rowIndex];
  if (!row || row.key !== hit.rowKey) return null;
  const page = props.engine
    .getSnapshot()
    .project.pages.find((page) => page.id === props.compositionId);
  let name = row.layer.name;
  if (row.kind === "property") {
    const target = row.property.target;
    if (target.kind === "layer")
      name = t(
        (
          {
            x: "positionX",
            y: "positionY",
            "fillGradient.angle": "gradientAngle",
            "fillGradient.kind": "gradientKind",
          } as Record<string, string>
        )[target.property] ?? target.property,
      );
    else {
      const effect = row.layer.effects.find((effect) => effect.id === target.effectId),
        definition = effect && getEffectDefinition(effect.type),
        parameter = definition?.parameters.find(
          (parameter) =>
            parameter.key === target.property &&
            (parameter.scope === "settings") === (target.kind === "effectSetting"),
        );
      name = definition
        ? `${common(definition.nameKey)} · ${parameter ? common(parameter.labelKey) : t(target.property)}`
        : target.property;
    }
  }
  const content = () => {
    if (
      hit.kind === "clip" ||
      hit.kind === "trimStart" ||
      hit.kind === "trimEnd" ||
      hit.kind === "gap"
    ) {
      const track =
        hit.kind === "gap"
          ? undefined
          : page?.motion?.tracks.find((track) => track.id === hit.trackId);
      return (
        <TrackClips
          page={page}
          engine={props.engine}
          layerId={row.layer.id}
          name={name}
          tracks={track ? [track] : []}
          chosenId={row.track?.id}
          duration={model.duration}
          scale={model.scale}
          unit={props.unit}
          disabled={!props.interactive || row.layer.locked}
          gestures={props.gestures}
          drag={props.drag}
          transport={props.transport}
          onSelect={props.onSelect}
          onError={props.onError}
        />
      );
    }
    if (row.kind !== "property") return null;
    const key = row.property.keyframes.find((key) => key.id === hit.keyId);
    if (!key) return null;
    if (hit.kind === "easing") {
      const previous = row.property.keyframes.find((item) => item.id === hit.previousKeyId),
        viewport = props.host.viewport.current,
        left = viewport?.scrollLeft ?? 0,
        width = Math.max(0, (viewport?.clientWidth ?? 900) - model.gutter),
        from = Math.max(left, previous ? motionTimeToSeconds(previous.time) * model.scale : left),
        to = Math.min(left + width, motionTimeToSeconds(key.time) * model.scale);
      return (
        <EasingPopover
          engine={props.engine}
          compositionId={props.compositionId}
          property={row.property}
          destination={key}
        >
          <button
            type="button"
            className="motion-easing-segment"
            disabled={!props.interactive}
            style={{
              left: (from + to) / 2 - 7,
              width: 14,
            }}
            aria-label={common("motionEasing:edit", {
              name: `${name} · ${formatTimelineTime(key.time, props.unit)} ${props.unit}`,
            })}
          >
            <Spline size={11} aria-hidden />
          </button>
        </EasingPopover>
      );
    }
    if (hit.kind !== "key") return null;
    const count = hit.afterKeyIndex - hit.firstKeyIndex,
      x = motionTimeToSeconds(key.time) * model.scale;
    if (count > 1)
      return (
        <KeyCluster
          keys={row.property.keyframes}
          first={hit.firstKeyIndex}
          after={hit.afterKeyIndex}
          propertyId={hit.propertyId}
          name={name}
          x={x}
          unit={props.unit}
          gestures={props.gestures}
          transport={props.transport}
          onSelectLayer={(additive) => props.onSelect(row.layer.id, additive)}
          onZoomRange={props.onZoomRange}
        />
      );
    return (
      <KeyframeMarker
        marker={{
          key,
          count: 1,
          x,
          firstKeyIndex: hit.firstKeyIndex,
          afterKeyIndex: hit.afterKeyIndex,
        }}
        name={name}
        propertyId={hit.propertyId}
        layerId={row.layer.id}
        unit={props.unit}
        transport={props.transport}
        gestures={props.gestures}
        onSelect={props.onSelect}
        interactive={props.interactive}
      />
    );
  };
  return (
    <div
      className={`motion-row motion-canvas-active-overlay ${row.kind === "property" ? "is-property" : ""}`}
      data-layer-id={row.layer.id}
      data-layer-kind={row.layer.kind}
      data-motion-row-key={row.key}
      style={{ top: rowIndex * model.rowHeight, height: model.rowHeight }}
    >
      <span aria-hidden />
      <div
        className="motion-row-time"
        data-motion-property-id={row.kind === "property" ? row.property.id : undefined}
      >
        {content()}
      </div>
    </div>
  );
}
