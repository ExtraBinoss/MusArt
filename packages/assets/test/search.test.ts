import { expect, test } from "vitest";
import { createSearchIndex, normalizeSearch } from "../src/search";

test("catalog search folds accents, matches tokens in any order and ranks names before keywords", () => {
  const items = [
    { name: "Profile", tags: "Studio" },
    { name: "Studio Notes", tags: "design" },
    { name: "Studio", tags: "" },
    { name: "Éditorial — Alex Morgan", tags: "résumé serif" },
    { name: "My Studio", tags: "" },
  ];
  const index = createSearchIndex(items, {
    text: (item) => item.name,
    keywords: (item) => item.tags,
  });
  expect(index.search("STÚDIO").map((item) => item.name)).toEqual([
    "Studio",
    "Studio Notes",
    "My Studio",
    "Profile",
  ]);
  expect(index.search("morgan editorial")).toEqual([items[3]]);
  expect(index.search("resume serif")).toEqual([items[3]]);
  expect(index.search("missing")).toEqual([]);
  expect(index.search("", { limit: 2 })).toEqual(items.slice(0, 2));
  expect(index.search("", { limit: 0 })).toEqual([]);
  expect(
    index.search("studio", {
      filter: (item) => item.name !== "Studio",
      limit: 1,
    }),
  ).toEqual([items[1]]);
});

test("trigram candidates preserve all substring matches and deterministic order across a large catalog", () => {
  const items = Array.from({ length: 5000 }, (_, index) => ({
    name: `${["Alex Morgan", "Éditorial", "Studio", "Serif Notes"][index % 4]} ${index}`,
    tags: `resume ${index % 11} portfolio`,
  }));
  const index = createSearchIndex(items, {
    text: (item) => item.name,
    keywords: (item) => item.tags,
  });
  for (const query of [
    "a",
    "al",
    "lex",
    "éDIT",
    "3 portfolio",
    "morgan 12",
    "resume",
    "studio notes",
    "zxy",
    "49",
  ]) {
    const tokens = normalizeSearch(query).split(" ");
    const expected = items.filter((item) =>
      tokens.every((token) => normalizeSearch(`${item.name} ${item.tags}`).includes(token)),
    );
    const actual = index.search(query, { limit: items.length });
    expect(new Set(actual)).toEqual(new Set(expected));
    expect(index.search(query, { limit: 7 })).toEqual(actual.slice(0, 7));
  }
  expect(items[0].name).toBe("Alex Morgan 0");
});
