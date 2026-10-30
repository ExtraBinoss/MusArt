/** Immutable interval snapshots. Callers keep the source revision stable until replacement. */
export function createTimelineIntervalIndex<T>(
  items: readonly T[],
  range: (item: T) => { start: number; end: number },
) {
  const entries = items
    .map((item, order) => ({ item, order, ...range(item), maximum: -Infinity }))
    .sort((a, b) => a.start - b.start || a.order - b.order);
  const build = (first: number, last: number): number => {
    if (first >= last) return -Infinity;
    const at = (first + last) >>> 1;
    const entry = entries[at]!;
    entry.maximum = Math.max(entry.end, build(first, at), build(at + 1, last));
    return entry.maximum;
  };
  build(0, entries.length);
  return (start: number, end: number): T[] => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const found: typeof entries = [];
    const visit = (first: number, last: number) => {
      if (first >= last || entries[first]!.start > end) return;
      const at = (first + last) >>> 1;
      const entry = entries[at]!;
      if (entry.maximum < start) return;
      if (entry.start <= end && entry.end >= start) found.push(entry);
      visit(first, at);
      visit(at + 1, last);
    };
    visit(0, entries.length);
    return found.sort((a, b) => a.order - b.order).map((entry) => entry.item);
  };
}

export function timelineLowerBound<T>(items: readonly T[], value: number, at: (item: T) => number) {
  let first = 0,
    last = items.length;
  while (first < last) {
    const middle = (first + last) >>> 1;
    if (at(items[middle]!) < value) first = middle + 1;
    else last = middle;
  }
  return first;
}
