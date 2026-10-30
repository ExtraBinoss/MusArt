import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Copy, Plus, Trash2, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  compareMotionTime,
  motionTimeToSeconds,
  type Composition,
  type EnginePort,
  type MotionLayerTrack,
} from "@musart/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import { getMotionOccurrenceSelection } from "../../../state/motion/occurrence-selection";
import { formatUiError } from "../../../state/i18n/errors/format";
import type { TimelineGestures } from "../gestures";
import type { TimelineLayerDrag } from "../layer-drag/use-timeline-layer-drag";
import type { TimelineTransport, TimelineUnit } from "../model";
import { TrackDurationTooltip } from "../TrackDurationTooltip";
import { timelineTime } from "../time";
import { requestLayerTransition } from "../transitions/requests";
import { planOccurrencePlacement, type OccurrencePlacement } from "./placement";
import "./occurrences.css";
import "../messages";

interface Props {
  page?: Composition;
  engine?: EnginePort;
  layerId: string;
  name: string;
  tracks: readonly MotionLayerTrack[];
  chosenId?: string;
  duration: number;
  scale: number;
  disabled: boolean;
  unit?: TimelineUnit;
  gestures?: TimelineGestures;
  drag?: TimelineLayerDrag;
  transport: TimelineTransport;
  onSelect(id: string, additive: boolean): void;
  onError?(message: string): void;
}
/** Several clips share this one canonical row. Hover publication is DOM-only and frame-coalesced. */
export function TrackClips(props: Props) {
  const {
    engine,
    page,
    tracks,
    layerId,
    name,
    transport,
    gestures,
    drag,
    scale,
    duration,
    disabled,
  } = props;
  const { t } = useTranslation("motion");
  const [contextTime, setContextTime] = useState(transport.read().time);
  const [contextTrack, setContextTrack] = useState<string | null>(null);
  const contextOrigin = useRef<{ project: object; revision: number } | null>(null);
  const menuGeneration = useRef(0);
  const transitionHandoff = useRef<{
    project: object;
    revision: number;
    generation: number;
    trackId: string;
    point: { x: number; y: number } | undefined;
  } | null>(null);
  const contextPoint = useRef<{ x: number; y: number } | undefined>(undefined);
  const surface = useRef<HTMLDivElement>(null),
    ghost = useRef<HTMLButtonElement>(null);
  const proposal = useRef<{ plan: OccurrencePlacement; project: object; revision: number } | null>(
    null,
  );
  const hover = useRef<{
    x: number;
    left: number;
    pending: number | null;
    window: Window;
    stop(): void;
  } | null>(null);
  const hide = useCallback(() => {
    const active = hover.current;
    hover.current = null;
    active?.stop();
    if (active?.pending !== null && active?.pending !== undefined)
      active.window.cancelAnimationFrame(active.pending);
    if (ghost.current) ghost.current.hidden = true;
    proposal.current = null;
  }, []);
  useLayoutEffect(
    () => hide,
    [hide, page, engine, layerId, props.chosenId, scale, duration, disabled],
  );
  const publish = () => {
    const active = hover.current;
    if (!active || !engine || !page || disabled) return;
    active.pending = null;
    const seconds = Math.max(0, Math.min(duration, (active.x - active.left) / scale));
    const plan = planOccurrencePlacement(page, layerId, timelineTime(seconds), props.chosenId);
    const node = ghost.current;
    if (!node) return;
    node.hidden = !plan;
    if (!plan) {
      proposal.current = null;
      return;
    }
    const snapshot = engine.getSnapshot();
    proposal.current = { plan, project: snapshot.project, revision: snapshot.revision };
    node.style.left = `${motionTimeToSeconds(plan.start) * scale}px`;
    node.style.width = `${Math.max(2, (motionTimeToSeconds(plan.end) - motionTimeToSeconds(plan.start)) * scale)}px`;
    node.dataset.copy = String(Boolean(plan.source));
  };
  const schedule = () => {
    const active = hover.current;
    if (active && active.pending === null)
      active.pending = active.window.requestAnimationFrame(publish);
  };
  const beginHover = (node: HTMLDivElement, x: number) => {
    if (!engine || !page || disabled) return;
    hide();
    const owner = node.ownerDocument.defaultView;
    if (!owner) return;
    const viewport = node.closest<HTMLElement>(".motion-timeline-scroll");
    let scroll = viewport?.scrollLeft ?? 0;
    const active = {
      x,
      left: node.getBoundingClientRect().left,
      pending: null as number | null,
      window: owner,
      stop: () => {},
    };
    const onScroll = () => {
      const next = viewport?.scrollLeft ?? scroll;
      active.left -= next - scroll;
      scroll = next;
      schedule();
    };
    viewport?.addEventListener("scroll", onScroll, { passive: true });
    active.stop = () => viewport?.removeEventListener("scroll", onScroll);
    hover.current = active;
    schedule();
  };
  const choose = (track: MotionLayerTrack) => {
    if (!engine || !page) return;
    if (
      engine.getSnapshot().pageId !== page.id ||
      engine.getSnapshot().project.pages.find((item) => item.id === page.id) !== page
    )
      return;
    if (gestures?.readSelected().size) gestures.selectKeys([], false);
    getMotionOccurrenceSelection(engine).select(page, layerId, track.id);
    const time = transport.read().time;
    if (
      compareMotionTime(time, track.start) < 0 ||
      compareMotionTime(time, track.end ?? page.motion!.duration) >= 0
    )
      transport.seek(track.start);
  };
  const commit = (plan: OccurrencePlacement) => {
    if (!engine || !page) return;
    if (
      engine.getSnapshot().pageId !== page.id ||
      engine.getSnapshot().project.pages.find((item) => item.id === page.id) !== page
    ) {
      props.onError?.("changed");
      return;
    }
    transport.pause();
    if (gestures?.readSelected().size) gestures.selectKeys([], false);
    try {
      const before = new Set(page.motion?.tracks.map((track) => track.id));
      engine.execute(
        plan.source
          ? {
              type: "duplicateMotionOccurrence",
              trackId: plan.source.id,
              start: plan.start,
              end: plan.end,
            }
          : { type: "addMotionOccurrence", layerId, start: plan.start, end: plan.end },
      );
      const current = engine.getSnapshot().project.pages.find((item) => item.id === page.id)!;
      const added = current.motion!.tracks.find(
        (track) => track.layerId === layerId && !before.has(track.id),
      );
      if (added) {
        getMotionOccurrenceSelection(engine).select(current, layerId, added.id);
        transport.seek(added.start);
      }
      props.onSelect(layerId, false);
    } catch (error) {
      props.onError?.(formatUiError(error));
    }
  };
  const menuCurrent = () => {
    const snapshot = engine?.getSnapshot(),
      origin = contextOrigin.current;
    const current =
      snapshot?.project === origin?.project &&
      snapshot?.revision === origin?.revision &&
      snapshot?.pageId === page?.id;
    if (!current) props.onError?.("changed");
    return current;
  };
  return (
    <div
      ref={surface}
      className="motion-occurrence-surface"
      onPointerEnter={(event) => {
        if (!event.buttons) beginHover(event.currentTarget, event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.target instanceof Element && event.target.closest(".motion-gap-add")) return;
        if (event.buttons) hide();
        else if (!hover.current) beginHover(event.currentTarget, event.clientX);
        else {
          hover.current.x = event.clientX;
          schedule();
        }
      }}
      onPointerLeave={hide}
    >
      {tracks.map((track) => {
        const from = Math.max(0, motionTimeToSeconds(track.start));
        const to = Math.min(duration, track.end ? motionTimeToSeconds(track.end) : duration);
        if (to <= from) return null;
        const bar = (
          <TrackDurationTooltip
            trackId={track.id}
            start={track.start}
            end={
              track.end ??
              page?.motion?.duration ?? { value: Math.round(duration * 1000), rate: 1000 }
            }
            unit={props.unit ?? "ms"}
          >
            <div
              className="motion-track-wrap"
              data-track-id={track.id}
              data-occurrence-selected={String(props.chosenId === track.id)}
              style={{
                left: `var(--motion-trim-left, ${from * scale}px)`,
                width: `var(--motion-trim-width, ${Math.max(2, (to - from) * scale)}px)`,
              }}
            >
              <button
                type="button"
                className="motion-track"
                disabled={disabled}
                aria-label={t("track", { name })}
                aria-pressed={props.chosenId === track.id}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  hide();
                  choose(track);
                  if (drag) drag.pointer.begin(event, track);
                  else gestures?.beginTrack(event, track, "move");
                }}
                onClick={(event) => {
                  if (gestures?.consumePointerClick(event.detail)) return;
                  choose(track);
                  props.onSelect(layerId, event.shiftKey);
                }}
              />
              {gestures && (
                <>
                  <button
                    type="button"
                    className="motion-trim-handle is-start"
                    aria-label={t("trimStart", { name })}
                    disabled={disabled}
                    onPointerDown={(event) => {
                      choose(track);
                      gestures.beginTrack(event, track, "trimStart");
                    }}
                  />
                  <button
                    type="button"
                    className="motion-trim-handle is-end"
                    aria-label={t("trimEnd", { name })}
                    disabled={disabled}
                    onPointerDown={(event) => {
                      choose(track);
                      gestures.beginTrack(event, track, "trimEnd");
                    }}
                  />
                </>
              )}
            </div>
          </TrackDurationTooltip>
        );
        if (!engine || !page) return <div key={track.id}>{bar}</div>;
        const duplicate = planOccurrencePlacement(page, layerId, contextTime, track.id);
        const generation = menuGeneration.current;
        return (
          <ContextMenu
            key={track.id}
            modal={false}
            onOpenChange={(open) => {
              setContextTrack(open ? track.id : null);
              if (open) {
                menuGeneration.current++;
                transitionHandoff.current = null;
                transport.pause();
                const snapshot = engine.getSnapshot();
                contextOrigin.current = { project: snapshot.project, revision: snapshot.revision };
                setContextTime(transport.read().time);
              }
            }}
          >
            <ContextMenuTrigger
              asChild
              onContextMenu={(event) => {
                contextPoint.current = { x: event.clientX, y: event.clientY };
              }}
            >
              {bar}
            </ContextMenuTrigger>
            {contextTrack === track.id && (
              <ContextMenuContent
                onCloseAutoFocus={(event) => {
                  const action = transitionHandoff.current;
                  if (!action) return;
                  event.preventDefault();
                  if (
                    action.generation !== generation ||
                    generation !== menuGeneration.current ||
                    action.trackId !== track.id
                  )
                    return;
                  transitionHandoff.current = null;
                  const current = engine.getSnapshot();
                  if (
                    current.project !== action.project ||
                    current.revision !== action.revision ||
                    current.pageId !== page.id
                  ) {
                    props.onError?.("changed");
                    return;
                  }
                  void requestLayerTransition(
                    engine,
                    page.id,
                    layerId,
                    action.point,
                    action.trackId,
                  ).catch((error: unknown) => props.onError?.(formatUiError(error)));
                }}
              >
                <ContextMenuItem
                  disabled={disabled}
                  onSelect={() => {
                    if (menuCurrent())
                      transitionHandoff.current = {
                        ...contextOrigin.current!,
                        generation,
                        trackId: track.id,
                        point: contextPoint.current,
                      };
                  }}
                >
                  <WandSparkles />
                  {t("occurrenceTransition")}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={disabled || !duplicate}
                  onSelect={() => {
                    if (!menuCurrent()) return;
                    const plan = planOccurrencePlacement(
                      page,
                      layerId,
                      transport.read().time,
                      track.id,
                    );
                    if (plan) commit(plan);
                  }}
                >
                  <Copy />
                  {t("duplicateOccurrence")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  disabled={disabled}
                  onSelect={() => {
                    if (!menuCurrent()) return;
                    try {
                      engine.execute({ type: "deleteMotionOccurrence", trackId: track.id });
                    } catch (error) {
                      props.onError?.(formatUiError(error));
                    }
                  }}
                >
                  <Trash2 />
                  {t("deleteOccurrence")}
                </ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
        );
      })}
      <button
        ref={ghost}
        hidden
        type="button"
        className="motion-gap-add"
        disabled={disabled}
        aria-label={t("addOccurrence", { name })}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          const value = proposal.current,
            snapshot = engine?.getSnapshot();
          if (
            !value ||
            snapshot?.project !== value.project ||
            snapshot.revision !== value.revision
          ) {
            props.onError?.("changed");
            return;
          }
          commit(value.plan);
          hide();
        }}
      >
        <Copy className="motion-gap-copy" size={12} />
        <Plus className="motion-gap-plus" size={12} />
      </button>
    </div>
  );
}
