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
export function searchItems(items: readonly SearchItem[], query: string, category: SearchFilter) {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  const scored = items
    .flatMap((item, order) => {
      if (category !== "all" && item.category !== category) return [];
      const { label, terms } = prepareItem(item);
      const scores = words.map((word) => wordScore(terms, word));
      if (scores.some((score) => score === 0)) return [];
      const score =
        scores.reduce((sum, value) => sum + value, 0) +
        words.reduce((sum, word) => sum + wordScore(label, word), 0);
      return [{ item, order, score }];
    })
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const counts = new Map<string, number>();
  const browsing = words.length === 0 && category === "all";
  const visible = scored
    .filter(({ item }) => {
      const count = counts.get(item.category) ?? 0;
      counts.set(item.category, count + 1);
      return !browsing || count < 2;
    })
    .slice(0, 80)
    .map(({ item }) => item);
  return {
    items: visible,
    total: scored.length,
    browsing,
    limited: visible.length < scored.length,
  };
}
