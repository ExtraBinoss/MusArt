import { afterEach, expect, it } from "vitest";
import { deleteDB } from "idb";
import {
  readLibraryFavorites,
  setLibraryFavorite,
} from "../../../../src/services/projects/library/favorites";
afterEach(async () => {
  await deleteDB("musart-library");
});
it("atomically preserves concurrent bookmark edits, persists durable ids and excludes transient previews", async () => {
  const project = {
    kind: "project" as const,
    id: "durable-project",
    name: "My animation",
    mode: "motion" as const,
    pageId: "page",
    preview: "blob:session-only",
  };
  const template = {
    kind: "template" as const,
    id: "in-bloom",
    name: "In Bloom",
    mode: "motion" as const,
  };
  await Promise.all([setLibraryFavorite(project, true), setLibraryFavorite(template, true)]);
  const items = await readLibraryFavorites();
  expect(items).toHaveLength(2);
  expect(items.find((item) => item.kind === "project")).toEqual({
    kind: "project",
    id: "durable-project",
    name: "My animation",
    mode: "motion",
    pageId: "page",
  });
  await setLibraryFavorite(project, false);
  expect(await readLibraryFavorites()).toEqual([template]);
});
it("rejects invalid records without overwriting existing bookmarks", async () => {
  const item = {
    kind: "template" as const,
    id: "in-bloom",
    name: "In Bloom",
    mode: "motion" as const,
  };
  await setLibraryFavorite(item, true);
  await expect(setLibraryFavorite({ ...item, id: "" }, true)).rejects.toThrow("Invalid");
  expect(await readLibraryFavorites()).toEqual([item]);
});
