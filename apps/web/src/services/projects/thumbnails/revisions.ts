import type { Asset, Composition } from "@musart/core";
import type { ThumbnailHashJob } from "../../serialization/hashing/protocol";
import { thumbnailRevision } from "./revision";

/** Valid multi-page saves use two slots instead of overflowing the shared eight-job worker queue. */
export async function thumbnailRevisions(
  pages: readonly Composition[],
  assets: Record<string, Asset>,
  hash: (job: ThumbnailHashJob) => Promise<string>,
): Promise<Record<string, string>> {
  const revisions: (readonly [string, string])[] = [];
  let next = 0,
    failed = false;
  async function consume() {
    while (next < pages.length && !failed) {
      const index = next++,
        page = pages[index]!;
      try {
        revisions[index] = [page.id, await thumbnailRevision(page, assets, hash)];
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, pages.length) }, consume));
  return Object.fromEntries(revisions);
}
