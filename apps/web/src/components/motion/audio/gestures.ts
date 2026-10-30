import {
  motionTimeToSeconds,
  normalizeMotionTime,
  addMotionTime,
  subtractMotionTime,
  type EnginePort,
  type MotionAudioTrack,
  type AudioAsset,
} from "@musart/core";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { TimelineTransport } from "../model";
import { createDragAutoScroll } from "../../shared/scroll/drag-auto-scroll";
import { createClipDurationTooltipPreview } from "../gestures/tooltip";
type Kind = "move" | "start" | "end";
const time = (seconds: number) =>
  normalizeMotionTime({ value: Math.round(seconds * 1_000_000), rate: 1_000_000 });

/** Independent audio clips never enter the layer-selection or visual stacking controllers. */
export function createAudioTrackGestures(
  engine: EnginePort,
  transport: TimelineTransport,
  onError: (error: unknown) => void,
) {
  let cancel: (() => void) | null = null;
  let preview: { trackId: string; start: number; end: number; sourceIn: number } | null = null;
  const listeners = new Set<() => void>();
  function publish(next: typeof preview) {
    if (
      next &&
      preview &&
      next.trackId === preview.trackId &&
      next.start === preview.start &&
      next.end === preview.end &&
      next.sourceIn === preview.sourceIn
    )
      return;
    if (!next && !preview) return;
    preview = next;
    for (const listener of listeners) listener();
  }
  return {
    readPreview: () => preview,
    subscribePreview(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel() {
      cancel?.();
    },
    begin(
      event: ReactPointerEvent<HTMLElement>,
      track: MotionAudioTrack,
      asset: AudioAsset,
      kind: Kind,
      scale: number,
    ) {
      if (event.button !== 0) return;
      cancel?.();
      const node = event.currentTarget,
        wrap = node.closest<HTMLElement>(".motion-track-wrap"),
        viewport = node.closest<HTMLElement>(".motion-timeline-scroll");
      if (!wrap || !viewport) return;
      const snapshot = engine.getSnapshot(),
        page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
      if (
        page.motion?.mode !== "motion" ||
        page.motion.audioTracks?.find((item) => item.id === track.id) !== track
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      transport.pause();
      const originalStart = motionTimeToSeconds(track.start),
        originalEnd = motionTimeToSeconds(track.end),
        sourceIn = motionTimeToSeconds(track.sourceIn),
        duration = motionTimeToSeconds(asset.duration);
      const tooltip = createClipDurationTooltipPreview(node);
      const originX = event.clientX,
        originScroll = viewport.scrollLeft,
        pointer = event.pointerId;
      const min = Math.min(originalEnd - originalStart, 1 / asset.sampleRate);
      let x = originX,
        y = event.clientY,
        alt = event.altKey,
        start = originalStart,
        end = originalEnd,
        stopped = false;
      const current = () => {
        const latest = engine.getSnapshot();
        return (
          latest.project === snapshot.project &&
          latest.pageId === snapshot.pageId &&
          latest.revision === snapshot.revision
        );
      };
      function paint() {
        const raw = (x - originX + viewport!.scrollLeft - originScroll) / scale;
        const frameRate = page.motion!.frameRate.numerator / page.motion!.frameRate.denominator;
        const delta = alt ? raw : Math.round(raw * frameRate) / frameRate;
        if (kind === "move") {
          const shift = Math.max(-originalStart, delta);
          start = originalStart + shift;
          end = originalEnd + shift;
        } else if (kind === "start")
          start = Math.max(
            0,
            originalStart - sourceIn,
            Math.min(originalEnd - min, originalStart + delta),
          );
        else
          end = Math.max(
            originalStart + min,
            Math.min(
              originalEnd + duration - sourceIn - (originalEnd - originalStart),
              originalEnd + delta,
            ),
          );
        wrap!.style.setProperty("--motion-trim-left", `${start * scale}px`);
        wrap!.style.setProperty("--motion-trim-width", `${Math.max(2, (end - start) * scale)}px`);
        wrap!.dataset.audioDragging = "true";
        tooltip.set(time(end - start));
        publish({
          trackId: track.id,
          start,
          end,
          sourceIn: kind === "start" ? sourceIn + start - originalStart : sourceIn,
        });
      }
      const scroll = createDragAutoScroll({
        viewport,
        horizontalOnly: true,
        onScroll: paint,
        onFrame: paint,
      });
      function sample(input: PointerEvent) {
        x = input.clientX;
        y = input.clientY;
        alt = input.altKey;
      }
      function move(input: PointerEvent) {
        if (input.pointerId !== pointer) return;
        sample(input);
        paint();
        scroll.update(x, y);
      }
      function cleanup() {
        if (stopped) return;
        stopped = true;
        if (cancel === abort) cancel = null;
        publish(null);
        stopEngine();
        scroll.stop();
        tooltip.dispose();
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", finish);
        node.removeEventListener("pointercancel", canceled);
        node.removeEventListener("lostpointercapture", canceled);
        window.removeEventListener("keydown", key);
        window.removeEventListener("blur", abort);
        window.removeEventListener("resize", abort);
        if (node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
        wrap!.style.removeProperty("--motion-trim-left");
        wrap!.style.removeProperty("--motion-trim-width");
        delete wrap!.dataset.audioDragging;
      }
      function abort() {
        cleanup();
      }
      function canceled(input: PointerEvent) {
        if (input.pointerId === pointer) abort();
      }
      function key(input: KeyboardEvent) {
        if (input.key === "Escape") {
          input.preventDefault();
          abort();
        }
      }
      function finish(input: PointerEvent) {
        if (input.pointerId !== pointer) return;
        sample(input);
        paint();
        const accepted = current();
        cleanup();
        if (!accepted || (start === originalStart && end === originalEnd)) return;
        try {
          if (kind === "move")
            engine.execute({
              type: "moveMotionAudioTrack",
              trackId: track.id,
              delta: time(start - originalStart),
            });
          else {
            const exactStart =
              start === originalStart
                ? track.start
                : start === originalStart - sourceIn
                  ? subtractMotionTime(track.start, track.sourceIn)
                  : time(start);
            const maxEnd = originalEnd + duration - sourceIn - (originalEnd - originalStart);
            const exactEnd =
              end === originalEnd
                ? track.end
                : end === maxEnd
                  ? addMotionTime(track.start, subtractMotionTime(asset.duration, track.sourceIn))
                  : time(end);
            engine.execute({
              type: "setMotionAudioTrackRange",
              trackId: track.id,
              start: exactStart,
              end: exactEnd,
            });
          }
        } catch (error) {
          onError(error);
        }
      }
      const stopEngine = engine.subscribe(() => {
        if (!current()) abort();
      });
      cancel = abort;
      node.setPointerCapture(pointer);
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", finish);
      node.addEventListener("pointercancel", canceled);
      node.addEventListener("lostpointercapture", canceled);
      window.addEventListener("keydown", key);
      window.addEventListener("blur", abort);
      window.addEventListener("resize", abort);
    },
  };
}
