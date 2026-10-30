import {
  multiplyMatrices,
  type Bounds,
  type Composition,
  type Layer,
  type Matrix,
} from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { GpuResourceCache } from "../cache/GpuResourceCache";
import { effectFootprint } from "../effects/shared/footprint";
import { maskLayerMapping } from "./mask-binding";
import type { EffectResources } from "./effect-resources";
import type { GpuPasses } from "./passes";
import { rasterExtent, type FrameTexture } from "./types";

interface Context {
  target(role: string, width: number, height: number, mipmapped?: boolean): RenderTarget;
  passes: GpuPasses;
  effects: EffectResources;
  cache: GpuResourceCache;
  mask(id: string): Layer;
  maskSource(layer: Layer): FrameTexture;
  image(id: string): FrameTexture["texture"];
}
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

/** Finish source-local effects, masks and reference filtering with an explicit transport rectangle. */
export function finishLayerSource(
  layer: Layer,
  page: Composition,
  scale: number,
  input: FrameTexture,
  context: Context,
): FrameTexture {
  let source = input;
  let bounds: Bounds = { x: 0, y: 0, width: layer.width, height: layer.height };
  const enabled = layer.effects.some((effect) => effect.enabled);
  if (enabled) {
    const outset = effectFootprint(layer.effects);
    bounds = {
      x: -outset.left,
      y: -outset.top,
      width: layer.width + outset.left + outset.right,
      height: layer.height + outset.top + outset.bottom,
    };
    const width = rasterExtent(bounds.width, scale),
      height = rasterExtent(bounds.height, scale);
    if (source.premultiplied || outset.left || outset.top || outset.right || outset.bottom) {
      const straight = context.target("straight", width, height);
      context.passes.copyTo(source, straight, source.premultiplied, false, {
        x: bounds.x / layer.width,
        y: 1 - (bounds.y + bounds.height) / layer.height,
        width: bounds.width / layer.width,
        height: bounds.height / layer.height,
      });
      source = { texture: straight.texture, width, height, premultiplied: false };
    }
    const output = context.target("effects", width, height);
    context.cache.ensureCapacity(
      "shared-effects",
      context.effects.projectedBytes(width, height, layer.effects),
    );
    try {
      source = {
        texture: context.effects.apply(source.texture, width, height, layer.effects, output, {
          width: bounds.width,
          height: bounds.height,
        }),
        width,
        height,
        premultiplied: false,
      };
    } finally {
      context.cache.synchronize("shared-effects");
    }
    if (bounds.x || bounds.y || bounds.width !== layer.width || bounds.height !== layer.height)
      source.bounds = bounds;
  }
  const { width, height } = source;
  if (layer.mask?.enabled) {
    const target = context.target("mask", width, height),
      mask = layer.mask;
    if (mask.assetId) {
      context.passes.maskTo(source, context.image(mask.assetId), mask.inverted, target, {
        luminance: mask.mode === "luminance",
        transformed: true,
        targetWidth: bounds.width,
        targetHeight: bounds.height,
        sourceWidth: layer.width,
        sourceHeight: layer.height,
        matrix: translate(bounds.x, bounds.y),
      });
    } else if (mask.layerId) {
      const maskLayer = context.mask(mask.layerId);
      const mapping = maskLayerMapping(page, layer, maskLayer, false);
      const content = mapping.opacity > 0 ? context.maskSource(maskLayer) : source;
      mapping.premultiplied = content.premultiplied;
      const maskBounds = content.bounds;
      mapping.matrix = multiplyMatrices(
        translate(-(maskBounds?.x ?? 0), -(maskBounds?.y ?? 0)),
        multiplyMatrices(mapping.matrix, translate(bounds.x, bounds.y)),
      );
      mapping.sourceWidth = maskBounds?.width ?? mapping.sourceWidth;
      mapping.sourceHeight = maskBounds?.height ?? mapping.sourceHeight;
      mapping.targetWidth = bounds.width;
      mapping.targetHeight = bounds.height;
      context.passes.maskTo(source, content.texture, mask.inverted, target, mapping);
    } else throw new Error("Source de masque absente.");
    source = { ...source, texture: target.texture };
  }
  if (enabled || layer.mask?.enabled) {
    const filtered = context.target("reference", width, height, true);
    context.passes.copyTo(source, filtered, false, !source.premultiplied);
    source = { ...source, texture: filtered.texture, premultiplied: true };
  }
  return source;
}
