import type { Asset, Composition, Layer } from "@musart/core";
import { LinearFilter, NoColorSpace, Texture } from "three/webgpu";
import { assetIdentity } from "../cache/keys";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { loadAsset } from "./sources";
import { assertTextureSize } from "../cache/texture-limits";

class ImageResource implements GpuResource {
  readonly targets = 0;
  readonly bytes: number;
  constructor(
    readonly texture: Texture,
    width: number,
    height: number,
  ) {
    this.bytes = width * height * 4;
  }
  dispose(): void {
    this.texture.dispose();
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
    private readonly maxDimension: number,
  ) {}
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
        assertTextureSize(width, height, this.maxDimension);
        entry = new ImageResource(configure(new Texture(image)), width, height);
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
