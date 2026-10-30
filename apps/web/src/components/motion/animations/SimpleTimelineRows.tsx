import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import type { RefObject } from "react";
import { SimpleAudioRows } from "./SimpleAudioRows";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  motionTimeToSeconds,
  type EnginePort,
  type Composition,
  type MotionAnimation,
  type MotionLayerTrack,
  type SessionSnapshot,
} from "@musart/core";
import { Button } from "../../ui/button";
import { MotionPopover } from "./MotionPopover";
import { animationPresentation, useAnimationPresentation } from "./presentation";
import type { TimelineTransport } from "../model";
import "./animations.css";

interface Draft {
  pointer: number;
  x: number;
  start: number;
  duration: number;
  nextStart: number;
  nextDuration: number;
  edge: string | undefined;
  snapshot: SessionSnapshot;
  node: HTMLButtonElement;
}
function AnimationBlock({
  engine,
  animation,
  layerId,
  scale,
  selected,
  disabled,
  transport,
}: {
  engine: EnginePort;
  animation: MotionAnimation;
  layerId: string;
  scale: number;
  selected: boolean;
  disabled: boolean;
  transport: TimelineTransport;
}) {
  const draft = useRef<Draft | null>(null);
  const [error, setError] = useState(false);
  const { t } = useTranslation("animations");
  const start = motionTimeToSeconds(animation.start),
    duration = motionTimeToSeconds(animation.duration);
  function paint(node: HTMLButtonElement, from: number, span: number) {
    node.style.left = `${from * scale}px`;
    node.style.width = `${Math.max(5, span * scale)}px`;
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancel: boolean) {
    const active = draft.current;
    if (!active || active.pointer !== event.pointerId) return;
    draft.current = null;
    paint(active.node, start, duration);
    if (active.node.hasPointerCapture(active.pointer))
      active.node.releasePointerCapture(active.pointer);
    if (
      cancel ||
      engine.getSnapshot().project !== active.snapshot.project ||
      engine.getSnapshot().revision !== active.snapshot.revision
    )
      return;
    if (
      Math.abs(active.nextStart - start) < 1e-6 &&
      Math.abs(active.nextDuration - duration) < 1e-6
    )
      return;
    try {
      engine.execute({
        type: "updateMotionAnimation",
        animationId: animation.id,
        patch: {
          start: { value: Math.round(active.nextStart * 1000000), rate: 1000000 },
          duration: {
            value: Math.max(1, Math.round(active.nextDuration * 1000000)),
            rate: 1000000,
          },
        },
      });
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <button
      className="motion-animation-block"
      type="button"
      data-animation-id={animation.id}
      data-selected={selected}
      data-disabled={!animation.enabled}
      aria-label={`${animation.preset.name}, ${Math.round(duration * 1000)} ms`}
      disabled={disabled}
      style={{ left: start * scale, width: Math.max(5, duration * scale) }}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled) return;
        event.stopPropagation();
        transport.pause();
        engine.select([layerId]);
        animationPresentation(engine).set({ selected: animation.id });
        event.currentTarget.setPointerCapture(event.pointerId);
        draft.current = {
          pointer: event.pointerId,
          x: event.clientX,
          start,
          duration,
          nextStart: start,
          nextDuration: duration,
          edge: (event.target as HTMLElement).dataset.edge,
          snapshot: engine.getSnapshot(),
          node: event.currentTarget,
        };
      }}
      onPointerMove={(event) => {
        const active = draft.current;
        if (!active || active.pointer !== event.pointerId) return;
        const delta = Math.round(((event.clientX - active.x) / scale) * 1000) / 1000;
        if (active.edge === "end") active.nextDuration = Math.max(0.001, active.duration + delta);
        else if (active.edge === "start") {
          active.nextStart = Math.max(
            0,
            Math.min(active.start + active.duration - 0.001, active.start + delta),
          );
          active.nextDuration = active.start + active.duration - active.nextStart;
        } else active.nextStart = Math.max(0, active.start + delta);
        paint(active.node, active.nextStart, active.nextDuration);
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          try {
            engine.execute({ type: "deleteMotionAnimation", animationId: animation.id });
          } catch {
            setError(true);
          }
          return;
        }
        if (event.key === "Escape" && draft.current) {
          const active = draft.current;
          draft.current = null;
          paint(active.node, start, duration);
          if (active.node.hasPointerCapture(active.pointer))
            active.node.releasePointerCapture(active.pointer);
          event.preventDefault();
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.1 : 0.01);
          try {
            engine.execute({
              type: "updateMotionAnimation",
              animationId: animation.id,
              patch: {
                start: { value: Math.max(0, Math.round((start + delta) * 1000)), rate: 1000 },
              },
            });
          } catch {
            setError(true);
          }
        }
      }}
      onClick={() => {
        engine.select([layerId]);
        animationPresentation(engine).set({ selected: animation.id });
      }}
    >
      <span>{error ? t("applyFailed") : duration * scale > 80 ? animation.preset.name : ""}</span>
      <span className="animation-block-edge" data-edge="start" />
      <span className="animation-block-edge" data-edge="end" />
    </button>
  );
}

export function SimpleTimelineRows({
  engine,
  page,
  transport,
  scale,
  gutter,
  interactive,
  viewport,
}: {
  engine: EnginePort;
  page: Composition;
  transport: TimelineTransport;
  scale: number;
  gutter: number;
  interactive: boolean;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("animations");
  const presentation = useAnimationPresentation(engine);
  const geometry = createLayerGeometryIndex(page);
  const tracks = (page.motion?.tracks ?? []).filter(
    (track) =>
      track.animations?.length ||
      track.properties.some((property) => property.keyframes.length) ||
      track.end !== null ||
      geometry.get(track.layerId).kind === "video",
  );
  const rows: { track: MotionLayerTrack; animation?: MotionAnimation }[] = tracks.flatMap((track) =>
    track.animations?.length
      ? track.animations.map((animation) => ({ track, animation }))
      : [{ track }],
  );
  rows.sort((a, b) => {
    const start =
      motionTimeToSeconds(a.animation?.start ?? a.track.start) -
      motionTimeToSeconds(b.animation?.start ?? b.track.start);
    if (start) return start;
    return (
      motionTimeToSeconds(a.animation?.duration ?? page.motion!.duration) -
      motionTimeToSeconds(b.animation?.duration ?? page.motion!.duration)
    );
  });
  const { first, last } = useVirtualList(
    rows.length + (page.motion?.audioTracks?.length ?? 0),
    32,
    viewport,
    4,
  );
  return (
    <div
      className="motion-simple-rows"
      style={
        {
          "--motion-gutter": `${gutter}px`,
          height: (rows.length + (page.motion?.audioTracks?.length ?? 0)) * 32,
        } as CSSProperties
      }
      aria-label={t("title")}
    >
      {!rows.length && !page.motion?.audioTracks?.length && (
        <p className="animation-picker-empty">{t("select")}</p>
      )}
      {rows.slice(first, last).map(({ track, animation }, offset) => {
        const layer = geometry.get(track.layerId),
          disabled = !interactive || geometry.isLocked(layer.id);
        return (
          <div
            className="motion-simple-row"
            key={animation?.id ?? track.id}
            style={{ position: "absolute", top: (first + offset) * 32, width: "100%" }}
          >
            <div className="motion-simple-label">
              <Sparkles size={11} />
              <button
                className="animation-instance-name"
                onClick={() => {
                  engine.select([layer.id]);
                  if (animation) animationPresentation(engine).set({ selected: animation.id });
                }}
              >
                {layer.name}
                {animation ? ` · ${animation.preset.name}` : ""}
              </button>
              <MotionPopover
                engine={engine}
                compositionId={page.id}
                layerId={layer.id}
                trackId={track.id}
                transport={transport}
                disabled={disabled}
                trigger={
                  <Button variant="ghost" size="icon-xs" aria-label={t("add")} disabled={disabled}>
                    <Plus size={11} />
                  </Button>
                }
              />
            </div>
            <div className="motion-simple-lane">
              {animation ? (
                <AnimationBlock
                  engine={engine}
                  animation={animation}
                  layerId={layer.id}
                  scale={scale}
                  selected={presentation.selected === animation.id}
                  disabled={disabled}
                  transport={transport}
                />
              ) : (
                <div
                  className="motion-animation-block"
                  style={{
                    left: motionTimeToSeconds(track.start) * scale,
                    width: Math.max(
                      5,
                      motionTimeToSeconds(track.end ?? page.motion!.duration) * scale -
                        motionTimeToSeconds(track.start) * scale,
                    ),
                  }}
                >
                  <span>{layer.name}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <SimpleAudioRows
        first={Math.max(0, first - rows.length)}
        last={Math.max(0, last - rows.length)}
        top={rows.length * 32}
        engine={engine}
        page={page}
        transport={transport}
        scale={scale}
        interactive={interactive}
      />
    </div>
  );
}
