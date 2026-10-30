import { useLayoutEffect, type RefObject } from "react";
import { compareMotionTime, motionTimeToSeconds } from "@musart/core";
import type { TimelineTransport } from "./model";

type Options = {
  transport: TimelineTransport;
  pageId: string;
  scale: number;
  width: number;
  viewWidth: number;
  gutter: number;
  actionWidth: number;
  active: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  playheadRef: RefObject<HTMLDivElement | null>;
  playheadClipRef: RefObject<HTMLDivElement | null>;
  horizontalScrollRef: RefObject<number>;
  paintPlayheadRef: RefObject<() => void>;
};

/** Follow playback and paint its retained overlay without publishing React frame updates. */
export function useTimelinePlayhead({
  transport,
  pageId,
  scale,
  width,
  viewWidth,
  gutter,
  actionWidth,
  active,
  viewportRef,
  playheadRef,
  playheadClipRef,
  horizontalScrollRef,
  paintPlayheadRef,
}: Options) {
  useLayoutEffect(() => {
    let previous: number | null = null;
    const paint = () => {
      const state = transport.read();
      const node = viewportRef.current;
      if (playheadRef.current && playheadClipRef.current && node) {
        const x = motionTimeToSeconds(state.time) * scale;
        const left = Math.min(Math.max(0, width - viewWidth), horizontalScrollRef.current);
        const visibleWidth = Math.max(0, viewWidth);
        playheadClipRef.current.style.left = `${gutter + left}px`;
        // The overlay must never enlarge the native scroll extent at either edge.
        playheadClipRef.current.style.width = `${Math.max(0, Math.min(visibleWidth, width - left))}px`;
        playheadRef.current.style.transform = `translateX(${x - left}px)`;
        playheadRef.current.dataset.atEnd = String(
          compareMotionTime(state.time, state.duration) === 0,
        );
        playheadRef.current.style.visibility =
          state.compositionId !== pageId || x < left || x > left + visibleWidth
            ? "hidden"
            : "visible";
      }
    };
    const sync = () => {
      const state = transport.read(),
        node = viewportRef.current;
      const x = motionTimeToSeconds(state.time) * scale;
      if (active && state.playing && state.compositionId === pageId && node) {
        const visibleWidth = Math.max(1, viewWidth - actionWidth);
        const padding = Math.min(48, visibleWidth / 4);
        const reset =
          previous !== null && state.playbackMode === "loop" && previous - x > visibleWidth / 2;
        let left = horizontalScrollRef.current;
        if (reset) left = 0;
        else if (x > left + visibleWidth - padding) left = x - visibleWidth + padding;
        else if (x < left + padding) left = Math.max(0, x - padding);
        const next = Math.max(0, Math.min(Math.max(0, width - viewWidth), left));
        if (horizontalScrollRef.current !== next) {
          node.scrollLeft = next;
          horizontalScrollRef.current = node.scrollLeft;
        }
      }
      previous = x;
      paint();
    };
    paintPlayheadRef.current = paint;
    sync();
    const unsubscribe = transport.subscribe(sync);
    return () => {
      unsubscribe();
      paintPlayheadRef.current = () => {};
    };
  }, [
    transport,
    scale,
    pageId,
    viewWidth,
    width,
    active,
    gutter,
    actionWidth,
    viewportRef,
    playheadRef,
    playheadClipRef,
    horizontalScrollRef,
    paintPlayheadRef,
  ]);
}
