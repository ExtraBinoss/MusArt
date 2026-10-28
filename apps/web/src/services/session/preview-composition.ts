import {
  createLayerGeometryIndex,
  selectionComposition,
  type Composition,
  type Layer,
} from "@musart/core";
import type { LayerPreviewVariant } from "../../state/contracts";

/** Temporary presentation documents retain complete GPU mask graphs without editing canonical data. */
export function previewComposition(
  page: Composition,
  ids: readonly string[],
  reserved: Iterable<string>,
  variant?: LayerPreviewVariant,
): Composition {
  if (!variant) return selectionComposition(page, ids, reserved);
  if (ids.length !== 1) throw new TypeError("Attachment previews require one layer owner.");
  const geometry = createLayerGeometryIndex(page),
    owner = geometry.get(ids[0]!);
  if (variant.kind === "effect") {
    const at = owner.effects.findIndex((effect) => effect.id === variant.effectId);
    if (at < 0) throw new DOMException("Preview effect is missing.", "AbortError");
    const selected = selectionComposition(page, ids, reserved);
    return {
      ...selected,
      layers: selected.layers.map((layer) =>
        layer.id === owner.id ? { ...layer, effects: layer.effects.slice(0, at + 1) } : layer,
      ),
    };
  }
  if (variant.kind !== "mask") throw new TypeError("Invalid attachment preview variant.");
  if (!owner.mask) throw new DOMException("Preview mask is missing.", "AbortError");
  const path = new Set([owner.id, ...geometry.ancestors(owner.id).map((layer) => layer.id)]);
  const originals = geometry.byId;
  // Enable only this isolated mask for inspection; dependency copies keep original source processing.
  const selected = selectionComposition(page, ids, reserved);
  return {
    ...selected,
    background: "#000000",
    layers: selected.layers
      .filter((layer) => !originals.has(layer.id) || path.has(layer.id))
      .map((layer): Layer => {
        if (!path.has(layer.id)) return layer;
        if (layer.id !== owner.id)
          return {
            ...layer,
            opacity: 1,
            visible: true,
            blendMode: "normal",
            effects: [],
            mask: null,
          };
        return {
          ...layer,
          kind: "rectangle",
          opacity: 1,
          visible: true,
          blendMode: "normal",
          fill: "#ffffff",
          fillGradient: undefined,
          strokeWidth: 0,
          radius: 0,
          assetId: null,
          effects: [],
          mask: { ...layer.mask!, enabled: true },
        };
      }),
  };
}
