import { ensure } from "../errors";
import { assertRecord, assertText, assertBoolean } from "../document/guards";
export function validateMaskSource(mask: unknown, assets: Record<string, unknown>): void {
  assertRecord(mask);
  const asset = mask.assetId !== undefined,
    layer = mask.layerId !== undefined;
  ensure(asset !== layer, "INVALID_DOCUMENT", "A mask needs exactly one asset or layer source");
  if (asset) {
    assertText(mask.assetId);
    ensure(Object.hasOwn(assets, mask.assetId), "INVALID_DOCUMENT", "Mask asset is missing");
  }
  if (layer) assertText(mask.layerId);
  if (mask.mode !== undefined)
    ensure(
      mask.mode === "alpha" || mask.mode === "luminance",
      "INVALID_DOCUMENT",
      "Unknown mask mode",
    );
  assertBoolean(mask.enabled);
  assertBoolean(mask.inverted);
}
export function validateMaskGraph(layers: unknown[]): void {
  const nodes = new Map<string, Record<string, unknown>>();
  for (const layer of layers) {
    assertRecord(layer);
    assertText(layer.id);
    nodes.set(layer.id, layer);
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string, depth: number): void => {
    ensure(depth <= 128 && !active.has(id), "INVALID_HIERARCHY", "Cyclic mask/composition graph");
    if (visited.has(id)) return;
    const layer = nodes.get(id);
    ensure(layer, "INVALID_HIERARCHY", "Mask layer is missing from this page");
    active.add(id);
    if (layer.kind === "group")
      for (const child of nodes.values())
        if (child.parentId === id) {
          assertText(child.id);
          visit(child.id, depth + 1);
        }
    if (layer.mask !== null) {
      assertRecord(layer.mask);
      if (layer.mask.layerId !== undefined) {
        assertText(layer.mask.layerId);
        visit(layer.mask.layerId, depth + 1);
      }
    }
    active.delete(id);
    visited.add(id);
  };
  for (const id of nodes.keys()) visit(id, 0);
}
