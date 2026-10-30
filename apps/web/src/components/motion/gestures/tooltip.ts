import {
  addMotionTime,
  subtractMotionTime,
  motionTimeToSeconds,
  type MotionTime,
  type MotionLayerTrack,
} from "@musart/core";
import { createLiveNumberMotion } from "../../shared/live-number";
import { formatTimelineTime } from "../time";
import type { TimelineUnit } from "../model";

/** Keep the visible tooltip and Radix's accessible copy on the same exact transient time. */
export function createKeyframeTooltipPreview(key: HTMLElement) {
  const targets = [...key.ownerDocument.querySelectorAll<HTMLElement>("[data-motion-key-tooltip]")]
    .filter((node) => node.dataset.motionKeyTooltip === key.dataset.keyId)
    .map((node) => ({
      original: node.textContent ?? "",
      motion: createLiveNumberMotion(node),
      unit: (node.dataset.timeUnit === "s" ? "s" : "ms") as TimelineUnit,
    }));
  let disposed = false;
  return {
    set(time: MotionTime) {
      if (disposed) return;
      for (const { motion, unit } of targets)
        motion.set(`${formatTimelineTime(time, unit)} ${unit}`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { motion, original } of targets) {
        motion.reset(original);
        motion.dispose();
      }
    },
  };
}

/** Portals mount after pointer-down. Observe added tooltip nodes, never poll layout per frame. */
export function createClipDurationTooltipPreview(node: HTMLElement) {
  const id = node.closest<HTMLElement>("[data-motion-clip-id]")?.dataset.motionClipId;
  const targets = new Map<
    HTMLElement,
    { original: string; motion: ReturnType<typeof createLiveNumberMotion>; unit: TimelineUnit }
  >();
  let latest: MotionTime | null = null,
    disposed = false;
  const selector = "[data-motion-clip-tooltip]";
  function admit(target: HTMLElement) {
    if (
      disposed ||
      !id ||
      target.dataset.motionClipTooltip !== id ||
      targets.has(target) ||
      targets.size >= 4
    )
      return;
    const value = {
      original: target.textContent ?? "",
      motion: createLiveNumberMotion(target),
      unit: (target.dataset.timeUnit === "s" ? "s" : "ms") as TimelineUnit,
    };
    targets.set(target, value);
    if (latest) value.motion.set(`${formatTimelineTime(latest, value.unit)} ${value.unit}`);
  }
  for (const target of node.ownerDocument.querySelectorAll<HTMLElement>(selector)) admit(target);
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const added of record.addedNodes) {
        if (!(added instanceof HTMLElement)) continue;
        if (added.matches(selector)) admit(added);
        for (const target of added.querySelectorAll<HTMLElement>(selector)) admit(target);
      }
    if (targets.size >= 2) observer.disconnect();
  });
  if (id && targets.size < 2)
    observer.observe(node.ownerDocument.body, { childList: true, subtree: true });
  return {
    set(time: MotionTime) {
      if (disposed) return;
      latest = time;
      for (const { motion, unit } of targets.values())
        motion.set(`${formatTimelineTime(time, unit)} ${unit}`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      for (const { motion, original } of targets.values()) {
        motion.reset(original);
        motion.dispose();
      }
      targets.clear();
    },
  };
}
export function createTimelineTooltipPreview(node: HTMLElement, action: string) {
  return action === "keys"
    ? createKeyframeTooltipPreview(node)
    : createClipDurationTooltipPreview(node);
}
export function renderTimelineGestureTooltip(
  feedback: HTMLOutputElement | undefined,
  gesture: {
    action: string;
    anchor: MotionTime;
    delta: MotionTime;
    snapped: unknown;
    page: { motion?: { duration: MotionTime } };
    track?: MotionLayerTrack;
    tooltip?: { set(time: MotionTime): void };
  },
) {
  const time = addMotionTime(gesture.anchor, gesture.delta),
    track = gesture.track;
  const start =
    track && gesture.action === "trimStart"
      ? addMotionTime(track.start, gesture.delta)
      : track?.start;
  const baseEnd = track?.end ?? gesture.page.motion?.duration;
  const end =
    baseEnd && gesture.action === "trimEnd" ? addMotionTime(baseEnd, gesture.delta) : baseEnd;
  gesture.tooltip?.set(track && start && end ? subtractMotionTime(end, start) : time);
  if (feedback)
    feedback.textContent = `${motionTimeToSeconds(time).toFixed(3)} s${gesture.snapped ? " ◇" : ""}`;
}
