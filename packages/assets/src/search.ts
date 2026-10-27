// Copied from ResumI (MIT); see docs/legal/resumi-MIT.txt.
/** Immutable, framework-free catalog index. Normalize once, use rarest trigram postings,
 * then rank only candidates. No DOM, timers, workers or dependencies. */
export const normalizeSearch = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

type SearchOptions<T> = { limit?: number; filter?: (item: T) => boolean };
export function createSearchIndex<T>(
  items: readonly T[],
  describe: { text: (item: T) => string; keywords?: (item: T) => string },
) {
  const rows = items.map((item, order) => {
    const name = normalizeSearch(describe.text(item));
    return {
      item,
      order,
      name,
      words: name.split(" "),
      text: `${name} ${normalizeSearch(describe.keywords?.(item) ?? "")}`,
    };
  });
  const postings = new Map<string, number[]>();
  for (const row of rows) {
    const grams = new Set<string>();
    for (const word of row.text.split(" "))
      for (let at = 0; at <= word.length - 3; at++) grams.add(word.slice(at, at + 3));
    for (const gram of grams) {
      const list = postings.get(gram);
      if (list) list.push(row.order);
      else postings.set(gram, [row.order]);
    }
  }
  return {
    size: rows.length,
    search(query: string, { limit = 100, filter }: SearchOptions<T> = {}): T[] {
      const bound = Math.max(0, Math.floor(limit));
      if (!bound) return [];
      const needle = normalizeSearch(query);
      if (!needle) {
        const result: T[] = [];
        for (const row of rows) {
          if (!filter || filter(row.item)) result.push(row.item);
          if (result.length >= bound) break;
        }
        return result;
      }
      const tokens = needle.split(" ").filter(Boolean);
      const lists: number[][] = [];
      for (const token of tokens) {
        for (let at = 0; at <= token.length - 3; at++) {
          const list = postings.get(token.slice(at, at + 3));
          if (!list) return [];
          lists.push(list);
        }
      }
      lists.sort((a, b) => a.length - b.length);
      const candidates = lists[0] ?? rows.map((row) => row.order);
      const matches: { item: T; score: number; order: number }[] = [];
      for (const index of candidates) {
        const row = rows[index];
        if (!tokens.every((token) => row.text.includes(token)) || (filter && !filter(row.item)))
          continue;
        const score =
          !needle || row.name === needle
            ? 0
            : row.name.startsWith(needle)
              ? 1
              : tokens.every((token) => row.words.some((word) => word.startsWith(token)))
                ? 2
                : tokens.every((token) => row.name.includes(token))
                  ? 3
                  : 4;
        let low = 0,
          high = matches.length;
        while (low < high) {
          const mid = (low + high) >>> 1,
            other = matches[mid];
          if (other.score < score || (other.score === score && other.order < row.order))
            low = mid + 1;
          else high = mid;
        }
        if (low < bound) {
          matches.splice(low, 0, { item: row.item, score, order: row.order });
          if (matches.length > bound) matches.pop();
        }
      }
      return matches.map((match) => match.item);
    },
  };
}
