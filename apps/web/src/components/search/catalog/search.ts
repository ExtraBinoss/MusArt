import type { SearchFilter, SearchItem } from "./model";
const prepared = new WeakMap<SearchItem, { label: string; terms: string }>();

function prepareItem(item: SearchItem) {
  let index = prepared.get(item);
  if (!index) {
    index = {
      label: normalizeSearch(item.label),
      terms: normalizeSearch(`${item.label} ${item.terms}`),
    };
    prepared.set(item, index);
  }
  return index;
}
/** Normalize canonical catalog changes before the user asks to open the spotlight. */
export function prepareSearchItems(items: readonly SearchItem[]): void {
  for (const item of items) prepareItem(item);
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function wordScore(text: string, word: string): number {
  const at = text.indexOf(word);
  if (at >= 0) return at === 0 ? 100 : text[at - 1] === " " ? 75 : 50;
  // Subsequence matches keep small typos useful without a search-index dependency.
  let cursor = 0;
  for (const letter of text) {
    if (letter === " ") cursor = 0;
    else if (letter === word[cursor]) cursor++;
    if (cursor === word.length) return 10;
  }
  return 0;
}
const RESULT_LIMIT = 80;
interface RankedItem {
  item: SearchItem;
  order: number;
  score: number;
}
// The root is the worst retained match, including stable catalog order for equal scores.
function worse(a: RankedItem, b: RankedItem): boolean {
  return a.score < b.score || (a.score === b.score && a.order > b.order);
}
function retain(heap: RankedItem[], entry: RankedItem) {
  if (heap.length < RESULT_LIMIT) {
    heap.push(entry);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!worse(entry, heap[parent]!)) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = entry;
    return;
  }
  if (!worse(heap[0]!, entry)) return;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && worse(heap[child + 1]!, heap[child]!)) child++;
    if (!worse(heap[child]!, entry)) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = entry;
}
/** Score cached normalized terms once; only the best 80 rows are retained/sorted, regardless of project size. */
export function searchItems(items: readonly SearchItem[], query: string, category: SearchFilter) {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  const browsing = !words.length && category === "all";
  const counts = new Map<SearchItem["category"], number>();
  const visible: SearchItem[] = [],
    heap: RankedItem[] = [];
  let total = 0;
  for (let order = 0; order < items.length; order++) {
    const item = items[order]!;
    if (category !== "all" && item.category !== category) continue;
    if (!words.length) {
      total++;
      const count = counts.get(item.category) ?? 0;
      counts.set(item.category, count + 1);
      if (visible.length < RESULT_LIMIT && (!browsing || count < 2)) visible.push(item);
      continue;
    }
    const { label, terms } = prepareItem(item);
    let score = 0,
      matches = true;
    for (const word of words) {
      const match = wordScore(terms, word);
      if (!match) {
        matches = false;
        break;
      }
      score += match + wordScore(label, word);
    }
    if (!matches) continue;
    total++;
    // Avoid allocating a ranking entry for rows that cannot enter the bounded heap.
    const worst = heap[0];
    if (heap.length === RESULT_LIMIT && worst && score <= worst.score) continue;
    retain(heap, { item, order, score });
  }
  if (words.length) {
    heap.sort((a, b) => b.score - a.score || a.order - b.order);
    for (const entry of heap) visible.push(entry.item);
  }
  return { items: visible, total, browsing, limited: visible.length < total };
}
