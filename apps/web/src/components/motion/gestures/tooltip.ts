import type { MotionTime } from "@musart/core";
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
