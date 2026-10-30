export interface VirtualWindow {
  readonly first: number;
  /** Exclusive end. */
  readonly last: number;
  readonly totalHeight: number;
}

/** Pure fixed-row window. Admit overscan-sized blocks, never individual fractional scrolls.
 * The bucket's upper edge covers every partially visible row without changing its bounds.
 * Span <= ceil(height / rowHeight) + max(1, overscan) + 2 * overscan, clamped to count.
 */
export function virtualWindow(
  top: number,
  height: number,
  count: number,
  rowHeight: number,
  overscan = 4,
): VirtualWindow {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isFinite(rowHeight) ||
    rowHeight <= 0 ||
    !Number.isSafeInteger(overscan) ||
    overscan < 0 ||
    !Number.isFinite(top) ||
    !Number.isFinite(height) ||
    height < 0
  )
    throw new RangeError("Invalid fixed-row virtual window metrics.");
  const totalHeight = count * rowHeight;
  if (!Number.isFinite(totalHeight)) throw new RangeError("Virtual list height is not finite.");
  if (!count || !height) return { first: 0, last: 0, totalHeight };
  if (height >= totalHeight) return { first: 0, last: count, totalHeight };
  const maxTop = totalHeight - height;
  const clampedTop = Math.max(0, Math.min(top, maxTop));
  const block = Math.max(1, overscan);
  const visibleRows = Math.ceil(height / rowHeight);
  // At the end use row counts: subtracting a tiny viewport from huge pixel coordinates loses rows.
  const visibleFirst =
    top >= maxTop
      ? Math.max(0, count - visibleRows)
      : Math.min(count - 1, Math.floor(clampedTop / rowHeight));
  const anchor = Math.floor(visibleFirst / block) * block;
  return {
    first: Math.max(0, anchor - overscan),
    last: Math.min(count, anchor + block + visibleRows + overscan),
    totalHeight,
  };
}
