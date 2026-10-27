import type { Layer } from "@musart/core";
/** Complex paint/compositing stays on the exact isolated-surface path. */
export function isInstancedPrimitive(layer: Layer): boolean {
  return (
    (layer.kind === "rectangle" || layer.kind === "ellipse") &&
    layer.blendMode === "normal" &&
    !layer.mask?.enabled &&
    !layer.maskSource &&
    !layer.fillGradient &&
    !layer.effects.some((effect) => effect.enabled)
  );
}
/** Only appearance contributes; editor metadata and disabled effects do not invalidate paint. */
export function primitivePaintKey(layer: Layer): readonly (string | number)[] {
  return [
    layer.kind,
    layer.width,
    layer.height,
    layer.fill,
    layer.stroke,
    layer.strokeWidth,
    layer.radius,
  ];
}
