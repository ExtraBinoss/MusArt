import { expect, test, vi } from "vitest";
import {
  normalizeSearch,
  searchItems,
  prepareSearchItems,
} from "../../../../src/components/search/catalog/search";
import type { SearchItem } from "../../../../src/components/search/catalog/model";
const item = (
  id: string,
  label: string,
  terms = "",
  category: SearchItem["category"] = "layers",
): SearchItem => ({ id, label, terms, category, target: { kind: "page", pageId: id } });
test("normalizes diacritics, punctuation and case while retaining non-Latin names", () => {
  expect(normalizeSearch("  SÉLECTION / Élément-42! ")).toBe("selection element 42");
  expect(normalizeSearch("東京 ☀️")).toBe("東京");
});
test("ranks exact labels, word beginnings, embedded terms and subsequences deterministically", () => {
  const items = [
    item("1", "Image", "photographie"),
    item("2", "Photo bleue"),
    item("3", "Ma photo"),
    item("4", "Téléphoto"),
    item("5", "Phxoto"),
  ];
  expect(searchItems(items, "photo", "all").items.map((value) => value.id)).toEqual([
    "2",
    "3",
    "4",
    "1",
    "5",
  ]);
  expect(searchItems(items, "PHOT bleue", "all").items.map((value) => value.id)).toEqual(["2"]);
  expect(searchItems(items, "zzzzz", "all").items).toEqual([]);
  expect(searchItems([item("x", "Purple hot otter")], "photo", "all").items).toEqual([]);
  expect(searchItems([item("x", "Élévation")], "elvtn", "layers").items).toHaveLength(1);
});
test("bounds large result sets and gives every category room in the empty state", () => {
  const items = Array.from({ length: 100 }, (_, index) => item(String(index), `Layer ${index}`));
  items.push(item("tool", "Pointer", "", "tools"));
  const browse = searchItems(items, "", "all");
  expect(browse).toMatchObject({ total: 101, limited: true, browsing: true });
  expect(browse.items).toHaveLength(3);
  expect(browse.items.at(-1)?.id).toBe("tool");
  expect(searchItems(items, "", "layers")).toMatchObject({
    total: 100,
    browsing: false,
    limited: true,
  });
  expect(searchItems(items, "layer", "layers").items).toHaveLength(80);
  expect(searchItems(items, "pointer", "layers").items).toEqual([]);
});

test("canonical preparation normalizes document terms before first spotlight scoring", () => {
  const items: SearchItem[] = [
    {
      id: "prepared",
      label: "Préparé",
      terms: "Éditeur",
      category: "layers",
      target: { kind: "layer", pageId: "p", layerId: "l" },
    },
  ];
  prepareSearchItems(items);
  const normalize = vi.spyOn(String.prototype, "normalize");
  expect(searchItems(items, "editeur", "all").items).toEqual(items);
  expect(normalize).toHaveBeenCalledOnce();
  normalize.mockRestore();
});
