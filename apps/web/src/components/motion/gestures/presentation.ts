import {
  addMotionTime,
  motionTimeToSeconds,
  type Composition,
  type MotionLayerTrack,
} from "@musart/core";
import type { TimelineCanvasDraft } from "../canvas/model";
import { previewOccurrenceMove } from "./occurrences";
import type { KeyRange } from "../selection/ranges";

interface Gesture {
  action: TimelineCanvasDraft["action"];
  delta: TimelineCanvasDraft["delta"];
  keyIds: readonly string[];
  layerIds: ReadonlySet<string>;
  track?: MotionLayerTrack;
  trackIds?: ReadonlySet<string>;
  boundary?: "start" | "end" | null;
  page: Composition;
  touched: Set<HTMLElement>;
  links?: { shift(delta: TimelineCanvasDraft["delta"]): void };
}

/** One imperative draft serves Canvas painting and the active DOM interaction target. */
export function createTimelineGesturePresentation() {
  let current: TimelineCanvasDraft | null = null;
  let marquee: { ranges: readonly KeyRange[]; base: ReadonlySet<string> } | null = null;
  let sourceKeys: readonly string[] | null = null;
  let keyIds: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  let boundaryRoot: HTMLElement | null = null;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    read: () => current,
    readMarquee: () => marquee,
    marquee(this: void, ranges: readonly KeyRange[], base: ReadonlySet<string>) {
      marquee = { ranges, base };
      notify();
    },
    clearMarquee(this: void) {
      if (marquee) {
        marquee = null;
        notify();
      }
    },
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify,
    clear() {
      if (boundaryRoot) delete boundaryRoot.dataset.timelineBoundary;
      boundaryRoot = null;
      const changed = current !== null;
      current = null;
      sourceKeys = null;
      keyIds = new Set();
      if (changed) notify();
    },
    render(gesture: Gesture, root: HTMLElement, scale: number) {
      if (gesture.boundary) root.dataset.timelineBoundary = gesture.boundary;
      else delete root.dataset.timelineBoundary;
      boundaryRoot = root;
      if (sourceKeys !== gesture.keyIds) {
        sourceKeys = gesture.keyIds;
        keyIds = new Set(sourceKeys);
      }
      if (
        !current ||
        current.action !== gesture.action ||
        current.delta.value !== gesture.delta.value ||
        current.delta.rate !== gesture.delta.rate ||
        current.trackId !== gesture.track?.id ||
        current.keyIds !== keyIds ||
        current.boundary !== gesture.boundary
      ) {
        current = {
          action: gesture.action,
          delta: gesture.delta,
          trackId: gesture.track?.id,
          trackIds: gesture.trackIds,
          boundary: gesture.boundary,
          keyIds,
          layerIds: gesture.layerIds,
        };
        notify();
      }
      const px = motionTimeToSeconds(gesture.delta) * scale;
      if (gesture.action === "keys") {
        const ids = new Set(gesture.keyIds);
        for (const node of root.querySelectorAll<HTMLElement>(".motion-key[data-key-id]")) {
          if (!ids.has(node.dataset.keyId!)) continue;
          node.style.setProperty("--motion-drag-x", `${px}px`);
          gesture.touched.add(node);
        }
      } else if (gesture.action === "move") {
        gesture.links?.shift(gesture.delta);
        if (gesture.page.motion?.version === 2) {
          previewOccurrenceMove(
            root,
            gesture.trackIds ?? gesture.track!.id,
            keyIds,
            px,
            gesture.touched,
          );
        } else {
          for (const node of root.querySelectorAll<HTMLElement>(".motion-row[data-layer-id]")) {
            if (!gesture.layerIds.has(node.dataset.layerId!)) continue;
            node.style.setProperty("--motion-drag-x", `${px}px`);
            gesture.touched.add(node);
          }
        }
      } else {
        const track = gesture.track!,
          end = track.end ?? gesture.page.motion!.duration;
        const startTime =
          gesture.action === "trimStart" ? addMotionTime(track.start, gesture.delta) : track.start;
        const endTime = gesture.action === "trimEnd" ? addMotionTime(end, gesture.delta) : end;
        for (const node of root.querySelectorAll<HTMLElement>(
          ".motion-track-wrap[data-track-id]",
        )) {
          if (node.dataset.trackId !== track.id) continue;
          node.style.setProperty(
            "--motion-trim-left",
            `${motionTimeToSeconds(startTime) * scale}px`,
          );
          node.style.setProperty(
            "--motion-trim-width",
            `${(motionTimeToSeconds(endTime) - motionTimeToSeconds(startTime)) * scale}px`,
          );
          gesture.touched.add(node);
        }
      }
    },
  };
}
