import type { Effect } from "@musart/core";
export function blurFootprint(effect: Effect) {
  // Reserve the full radius through amount animation, avoiding per-frame target reallocations.
  const margin = Math.ceil(effect.scale * 3.2) + 1;
  return { left: margin, top: margin, right: margin, bottom: margin };
}
