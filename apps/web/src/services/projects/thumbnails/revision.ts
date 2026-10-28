import { isPublishedComposition, type Asset, type Composition } from "@musart/core";
import { computeCanonicalHash } from "../../serialization/hashing/compute";
import type { ThumbnailHashJob } from "../../serialization/hashing/protocol";
const originals = new Map<string, { source: string; bytes: number; digest: Promise<string> }>();
let retainedBytes = 0;
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function original(asset: Pick<Asset, "id" | "dataUrl"> | undefined): Promise<string> {
  if (!asset) return Promise.resolve("missing");
  const cached = originals.get(asset.id);
  if (cached?.source === asset.dataUrl) {
    originals.delete(asset.id);
    originals.set(asset.id, cached);
    return cached.digest;
  }
  if (cached) {
    originals.delete(asset.id);
    retainedBytes -= cached.bytes;
  }
  const entry = {
    source: asset.dataUrl,
    bytes: asset.dataUrl.length * 2,
    digest: digest(asset.dataUrl),
  };
  originals.set(asset.id, entry);
  retainedBytes += entry.bytes;
  while (originals.size > 128 || retainedBytes > 64 * 1024 * 1024) {
    const key = originals.keys().next().value!;
    retainedBytes -= originals.get(key)!.bytes;
    originals.delete(key);
  }
  void entry.digest.catch(() => {
    if (originals.get(asset.id) === entry) {
      originals.delete(asset.id);
      retainedBytes -= entry.bytes;
    }
  });
  return entry.digest;
}
/** Hash pixel metadata and cached original digests; large original strings never enter page JSON. */
export async function thumbnailRevision(
  page: Composition,
  assets: Record<string, Asset>,
  hash: (job: ThumbnailHashJob) => Promise<string> = computeCanonicalHash,
): Promise<string> {
  const captured = isPublishedComposition(page) ? page : structuredClone(page);
  const ids = [
    ...new Set(
      captured.layers
        .flatMap((layer) => [layer.assetId, layer.mask?.assetId])
        .filter((id): id is string => !!id),
    ),
  ].sort();
  const pendingSources = ids.map((id) => {
    const asset = assets[id];
    return [id, original(asset ? { id: asset.id, dataUrl: asset.dataUrl } : undefined)] as const;
  });
  const sources = await Promise.all(
    pendingSources.map(async ([id, digest]) => [id, await digest] as const),
  );
  return hash({ kind: "thumbnail", page: captured, sources });
}
export function clearThumbnailRevisionCache(): void {
  originals.clear();
  retainedBytes = 0;
}
