import type { Asset, Composition } from "@musart/core";
import { estimatePreviewCost } from "@musart/render/preview-cost";
export const PREVIEW_MEMORY_BYTES = 192 * 1024 * 1024;
const HEADROOM_BYTES = 16 * 1024 * 1024;
/** Stable quarter-density steps follow actual raster roles; effects/masks retain their 1x reference. */
export function previewScale(
  page: Composition,
  density: number,
  maxDimension = 16384,
  assets: Record<string, Asset> = {},
): number {
  const desired = Number.isFinite(density) && density > 0 ? density : 1;
  const minimum = 1 / Math.max(page.width, page.height);
  const limit = Math.min(
    8,
    16384 / Math.max(page.width, page.height),
    maxDimension / Math.max(page.width, page.height),
    Math.sqrt(64_000_000 / (page.width * page.height)),
  );
  const requested =
    desired < 1
      ? Math.max(minimum, Math.round(desired * 1_000_000) / 1_000_000 || desired)
      : Math.ceil((desired - 1e-6) * 4) / 4;
  const upper = Math.max(minimum, Math.min(requested, limit));
  const fits = (scale: number) => {
    const cost = estimatePreviewCost(page, scale, assets);
    return (
      cost.targetBytes + HEADROOM_BYTES <= PREVIEW_MEMORY_BYTES &&
      cost.bytes + HEADROOM_BYTES <= 384 * 1024 * 1024 &&
      cost.maxDimension <= maxDimension
    );
  };
  // No scale can solve oversized originals/fixed references. Keep a useful frame
  // request and let real GPU admission report failure, rather than shrinking it to1px.
  if (!fits(minimum)) return Math.min(upper, 1);
  if (upper < 1 && fits(upper)) return upper;
  if (upper >= 1) {
    let low = 4,
      high = Math.floor((upper + 1e-8) * 4),
      best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (fits(mid / 4)) {
        best = mid;
        low = mid + 1;
      } else high = mid - 1;
    }
    if (best) return best / 4;
  }
  // Large pages must pass the same caps below1x; minimum keeps both backing axes nonzero.
  let low = 0,
    high = Math.min(upper, 1);
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (fits(Math.max(minimum, mid))) low = mid;
    else high = mid;
  }
  const bounded = Math.floor(low * 1_000_000) / 1_000_000;
  return Math.max(minimum, Math.min(upper, bounded));
}
