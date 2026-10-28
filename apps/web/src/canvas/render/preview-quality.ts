import type { Composition } from "@musart/core";
/** Quantized zoom/DPR quality, with conservative headroom for retained intermediates. */
export function previewScale(page: Composition, density: number): number {
  if (!Number.isFinite(density) || density <= 0) return 1;
  const requested = Math.min(8, 2 ** Math.ceil(Math.log2(Math.max(1, density)) - 1e-6));
  const area = page.width * page.height;
  const layerPixels = page.layers.reduce((sum, layer) => {
    if (!layer.visible || layer.opacity === 0) return sum;
    return (
      sum +
      layer.width *
        layer.height *
        (2 +
          layer.effects.filter((effect) => effect.enabled).length * 2 +
          (layer.mask?.enabled ? 2 : 0))
    );
  }, 0);
  const safe = Math.min(
    8,
    16384 / Math.max(page.width, page.height),
    Math.sqrt(64_000_000 / area),
    Math.sqrt((192 * 1024 * 1024) / (4 * (area * 3 + layerPixels))),
  );
  return Math.max(1, Math.min(requested, 2 ** Math.floor(Math.log2(Math.max(1, safe)))));
}
