import type { OriginalMediaAsset } from "@musart/core";
/** Platform adapter resolves immutable originals lazily. Reusable rendering never imports editor/storage. */
export interface MediaSourceResolver {
  resolveOriginal(asset: OriginalMediaAsset, options?: { signal?: AbortSignal }): Promise<Blob>;
}
