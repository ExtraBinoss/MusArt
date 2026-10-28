import { expect, test, vi } from "vitest";
import { createPage } from "@musart/core";
import { thumbnailRevisions } from "../../../../src/services/projects/thumbnails/revisions";

test("hashes one hundred pages using two admitted slots and preserves page order", async () => {
  let active = 0,
    peak = 0;
  const pages = Array.from({ length: 100 }, (_, index) => createPage({ id: String(index) }));
  const result = await thumbnailRevisions(pages, {}, async (job) => {
    active++;
    peak = Math.max(active, peak);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
    return job.page.id;
  });
  expect(peak).toBe(2);
  expect(result).toEqual(Object.fromEntries(pages.map((page) => [page.id, page.id])));
  expect(await thumbnailRevisions([], {}, vi.fn())).toEqual({});
});

test("propagates hashing failures and stops admitting work without an unhandled sibling rejection", async () => {
  const hash = vi.fn().mockRejectedValue(new Error("digest failed"));
  await expect(
    thumbnailRevisions(
      Array.from({ length: 5 }, () => createPage()),
      {},
      hash,
    ),
  ).rejects.toThrow("digest failed");
  expect(hash).toHaveBeenCalledTimes(2);
});

test("uses the shared page resolver with two slots without recomputing its cached digest", async () => {
  const pages = [createPage(), createPage(), createPage()],
    hash = vi.fn();
  const resolve = vi.fn(async (page: (typeof pages)[number]) => page.id);
  const result = await thumbnailRevisions(pages, {}, hash, resolve);
  expect(result).toEqual(Object.fromEntries(pages.map((page) => [page.id, page.id])));
  expect(hash).not.toHaveBeenCalled();
  expect(resolve).toHaveBeenCalledTimes(3);
});
