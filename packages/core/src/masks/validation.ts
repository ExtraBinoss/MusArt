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
  const children = new Map<unknown, string[]>();
  for (const layer of layers) {
    assertRecord(layer);
    assertText(layer.id);
    nodes.set(layer.id, layer);
    const parentId = layer.parentId;
    const siblings = children.get(parentId) ?? [];
    siblings.push(layer.id);
    children.set(parentId, siblings);
  }
  const remainingDepth = new Map<string, number>(),
    active = new Set<string>();
  const visit = (id: string, depth: number): number => {
    ensure(depth <= 128 && !active.has(id), "INVALID_HIERARCHY", "Cyclic mask/composition graph");
    const cached = remainingDepth.get(id);
    if (cached !== undefined) {
      ensure(depth + cached <= 128, "INVALID_HIERARCHY", "Excessive mask/composition depth");
      return cached;
    }
    const layer = nodes.get(id);
    ensure(layer, "INVALID_HIERARCHY", "Mask layer is missing from this page");
    active.add(id);
    let remaining = 0;
    if (layer.kind === "group")
      for (const childId of children.get(id) ?? [])
        remaining = Math.max(remaining, 1 + visit(childId, depth + 1));
    if (layer.mask !== null) {
      assertRecord(layer.mask);
      if (layer.mask.layerId !== undefined) {
        assertText(layer.mask.layerId);
        remaining = Math.max(remaining, 1 + visit(layer.mask.layerId, depth + 1));
      }
    }
    active.delete(id);
    remainingDepth.set(id, remaining);
    return remaining;
  };
  for (const id of nodes.keys()) visit(id, 0);
}
