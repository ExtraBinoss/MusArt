import type { Asset, Composition, Layer } from "@musart/core";
import { CanvasTexture, LinearFilter, NoColorSpace, Texture } from "three/webgpu";
import { assetIdentity } from "../cache/keys";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { LayerTargets } from "../compositing/targets";
import { context2d, createSurface, drawText, loadAsset } from "./sources";

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
  constructor(private readonly cache: GpuResourceCache) {}
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
    if (document.fonts) {
      const faces = new Set(
        visible
          .filter((layer) => layer.kind === "text")
          .map(
            (layer) =>
              `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily.replaceAll('"', "")}"`,
          ),
      );
      await Promise.all([...faces].map((face) => document.fonts.load(face)));
      await document.fonts.ready;
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
        entry = new ImageResource(
          configure(new Texture(image)),
          image.naturalWidth || asset.width,
          image.naturalHeight || asset.height,
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
  text(layer: Layer, scale: number, entry: LayerTargets): Texture {
    const key = JSON.stringify([
      layer.text,
      layer.width,
      layer.height,
      layer.fontFamily,
      layer.fontSize,
      layer.fontWeight,
      layer.lineHeight,
      layer.letterSpacing,
      layer.textAlign,
      layer.fill,
      scale,
    ]);
    if (entry.sourceTexture && entry.sourceSignature === key) return entry.sourceTexture;
    const canvas = createSurface(layer.width * scale, layer.height * scale);
    const context = context2d(canvas);
    context.scale(scale, scale);
    drawText(context, layer);
    const texture = configure(new CanvasTexture(canvas));
    entry.setSource(texture, key, canvas.width * canvas.height * 4);
    this.uploads++;
    return texture;
  }
}
