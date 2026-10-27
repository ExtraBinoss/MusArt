import type { Asset, Composition, Layer } from "@musart/core";
import { LinearFilter, NoColorSpace, Texture } from "three/webgpu";
import { assetIdentity } from "../cache/keys";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { loadAsset } from "./sources";

class ImageResource implements GpuResource {
  readonly targets = 0;
  readonly bytes: number;
  constructor(
    readonly texture: Texture,
    width: number,
    height: number,
    private readonly bitmap?: ImageBitmap,
  ) {
    this.bytes = width * height * 4;
  }
  dispose(): void {
    this.texture.dispose();
    this.bitmap?.close();
  }
}
function configure(texture: Texture): Texture {
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export class TextureSources {
  uploads = 0;
  private readonly prepared = new Map<string, Texture>();
  constructor(
    private readonly cache: GpuResourceCache,
    private readonly options: { maxEdge?: number } = {},
  ) {
    if (options.maxEdge !== undefined && (!Number.isFinite(options.maxEdge) || options.maxEdge < 1))
      throw new Error("Invalid source texture limit.");
  }
  async prepare(page: Composition, assets: Record<string, Asset>): Promise<void> {
    this.prepared.clear();
    const byParent = new Map<string | null, Layer[]>();
    for (const layer of page.layers) {
      const siblings = byParent.get(layer.parentId) ?? [];
      siblings.push(layer);
      byParent.set(layer.parentId, siblings);
    }
    const visible: Layer[] = [];
    const parents: (string | null)[] = [null];
    while (parents.length) {
      for (const layer of byParent.get(parents.pop()!) ?? []) {
        if (!layer.visible || layer.opacity === 0) continue;
        visible.push(layer);
        if (layer.kind === "group") parents.push(layer.id);
      }
    }
    const active = new Set(
      visible
        .flatMap((layer) => [layer.assetId, layer.mask?.enabled ? layer.mask.assetId : null])
        .filter((id): id is string => !!id),
    );
    for (const id of active) {
      const asset = assets[id];
      if (!asset) throw new Error(`Ressource introuvable : ${id}`);
      const key = `asset:${assetIdentity(asset)}`;
      let entry = this.cache.get<ImageResource>(key);
      if (!entry) {
        const image = await loadAsset(asset);
        const width = image.naturalWidth || asset.width,
          height = image.naturalHeight || asset.height;
        const ratio = this.options.maxEdge
          ? Math.min(1, this.options.maxEdge / Math.max(width, height))
          : 1;
        const bitmap =
          ratio < 1
            ? await createImageBitmap(image, {
                resizeWidth: Math.max(1, Math.round(width * ratio)),
                resizeHeight: Math.max(1, Math.round(height * ratio)),
                resizeQuality: "high",
                premultiplyAlpha: "none",
                colorSpaceConversion: "none",
                // TSL TextureNode compensates ImageBitmap flipY on the WebGL backend.
                imageOrientation: "none",
              })
            : undefined;
        entry = new ImageResource(
          configure(new Texture(bitmap ?? image)),
          bitmap?.width ?? width,
          bitmap?.height ?? height,
          bitmap,
        );
        this.cache.set(key, entry);
        this.uploads++;
      }
      this.prepared.set(id, entry.texture);
    }
  }
  image(assetId: string | null): Texture {
    const texture = assetId ? this.prepared.get(assetId) : undefined;
    if (!texture) throw new Error("Image GPU introuvable.");
    return texture;
  }
}
