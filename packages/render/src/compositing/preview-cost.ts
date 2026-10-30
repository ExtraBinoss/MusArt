import {
  createLayerGeometryIndex,
  type Asset,
  type Bounds,
  type Composition,
  type Layer,
} from "@musart/core";
import { isInstancedPrimitive } from "./primitives/eligibility";
import {
  BASE_GEOMETRY_BYTES,
  INSTANCE_BYTES,
  MAX_PRIMITIVE_INSTANCES,
  primitiveCapacity,
} from "./primitives/attributes";
import { groupViewport } from "./group-viewport";
import { gradientStages } from "../effects/gradient/pipeline";
import { rasterExtent } from "./types";
import { maskLayerMapping } from "./mask-binding";

export interface PreviewCost {
  readonly bytes: number;
  readonly originalBytes: number;
  readonly targetBytes: number;
  readonly fixedBytes: number;
  readonly scaledBytes: number;
  readonly maxDimension: number;
}
/** Estimated current-frame targets. The hard GPU cache still admits retained/in-flight resources. */
export function estimatePreviewCost(
  page: Composition,
  scale: number,
  assets: Record<string, Asset> = {},
): PreviewCost {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid preview density.");
  const geometry = createLayerGeometryIndex(page),
    seen = new Set<string>(),
    originals = new Set<string>();
  let originalBytes = 0,
    fixedBytes = 0,
    scaledBytes = 0,
    maxDimension = 0,
    primitiveCount = 0,
    scratch = 0,
    backdrop = 0;
  function target(width: number, height: number, fixed: boolean, mip = false) {
    maxDimension = Math.max(maxDimension, width, height);
    let pixels = width * height;
    while (mip && (width > 1 || height > 1)) {
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
      pixels += width * height;
    }
    if (fixed) fixedBytes += pixels * 4;
    else scaledBytes += pixels * 4;
  }
  function children(
    parentId: string | null,
    width: number,
    height: number,
    density: number,
    fixed: boolean,
    window?: ReturnType<typeof groupViewport>,
  ) {
    const w = window?.pixelWidth ?? rasterExtent(width, density),
      h = window?.pixelHeight ?? rasterExtent(height, density);
    target(w, h, fixed);
    const list = window?.empty
      ? []
      : geometry.children(parentId).filter((l) => l.visible && l.opacity > 0 && !l.maskSource);
    if (list.some((l) => l.blendMode !== "normal")) target(w, h, fixed);
    const bounds = window?.bounds ?? { x: 0, y: 0, width, height };
    for (const l of list) {
      if (isInstancedPrimitive(l)) {
        primitiveCount++;
        continue;
      }
      layer(l, density, fixed, bounds);
    }
  }
  function layer(l: Layer, density: number, fixed: boolean, parent?: Bounds) {
    const reference = l.effects.some((e) => e.enabled) || !!l.mask?.enabled;
    if (reference) {
      density = 1;
      fixed = true;
    }
    const window = l.kind === "group" && !reference ? groupViewport(l, density, parent) : null;
    const key = `${l.id}:${density}:${window?.key ?? "full"}`;
    if (seen.has(key)) return;
    seen.add(key);
    const w = rasterExtent(l.width, density),
      h = rasterExtent(l.height, density);
    if (l.kind === "group") children(l.id, l.width, l.height, density, fixed, window);
    else if (l.kind !== "image" && l.kind !== "video") target(w, h, fixed);
    else {
      const asset = l.assetId ? assets[l.assetId] : undefined;
      const sourceKey = l.kind === "video" ? `video:${l.id}` : `image:${asset?.id}`;
      if (asset && !originals.has(sourceKey)) {
        originals.add(sourceKey);
        originalBytes += asset.width * asset.height * 4 * (l.kind === "video" ? 4 : 1);
        maxDimension = Math.max(maxDimension, asset.width, asset.height);
      }
      if (page.colorSpace === "display-p3") target(w, h, fixed);
    }
    const effects = l.effects.filter((e) => e.enabled);
    if (effects.length) {
      if (l.kind === "group" || l.kind === "text" || l.kind === "vector") target(w, h, fixed);
      target(w, h, fixed);
      const stages = effects.reduce(
        (n, e) => n + (e.type === "gradient" ? gradientStages(e).length : 1),
        0,
      );
      if (stages > 1) scratch = Math.max(scratch, w * h * 4);
      if (effects.some((e, i) => e.type === "gradient" && i > 0))
        backdrop = Math.max(backdrop, w * h * 4);
    }
    if (l.mask?.enabled) {
      target(w, h, fixed);
      if (l.mask.assetId) {
        const asset = assets[l.mask.assetId];
        if (asset && !originals.has(`image:${asset.id}`)) {
          originals.add(`image:${asset.id}`);
          originalBytes += asset.width * asset.height * 4;
          maxDimension = Math.max(maxDimension, asset.width, asset.height);
        }
      }
      if (l.mask.layerId) {
        const source = geometry.byId.get(l.mask.layerId);
        if (source && maskLayerMapping(page, l, source, false).opacity > 0)
          layer(source, density, fixed);
      }
    }
    if (reference) target(w, h, true, true);
  }
  children(null, page.width, page.height, scale, false);
  target(rasterExtent(page.width, scale), rasterExtent(page.height, scale), false);
  if (primitiveCount)
    fixedBytes +=
      BASE_GEOMETRY_BYTES +
      primitiveCapacity(Math.min(primitiveCount, MAX_PRIMITIVE_INSTANCES)) * INSTANCE_BYTES;
  // Shared effect scratch/backdrop are high-water resources, not one pair per layer.
  fixedBytes += scratch + backdrop;
  return {
    bytes: originalBytes + fixedBytes + scaledBytes,
    originalBytes,
    targetBytes: fixedBytes + scaledBytes,
    fixedBytes,
    scaledBytes,
    maxDimension,
  };
}
