import type { Layer } from "@musart/core";
export type LayerTreeEntry = { key: string; layer: Layer; depth: number } & (
  | { kind: "layer"; expanded: boolean }
  | { kind: "effect"; effectId: string }
  | { kind: "mask" }
);
/** One adjacency index and iterative DFS avoid rescanning every layer or limiting UI nesting. */
export function projectLayerTree(
  layers: readonly Layer[],
  collapsed: ReadonlySet<string>,
  attachments: ReadonlySet<string>,
  dropInside?: string,
): LayerTreeEntry[] {
  const children = new Map<string | null, Layer[]>();
  for (const layer of layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }
  const pending = (children.get(null) ?? []).map((layer) => ({ layer, depth: 0 }));
  const output: LayerTreeEntry[] = [];
  while (pending.length) {
    const { layer, depth } = pending.pop()!;
    const expanded =
      layer.kind === "group"
        ? !collapsed.has(layer.id) || layer.id === dropInside
        : attachments.has(layer.id);
    output.push({ kind: "layer", key: layer.id, layer, depth, expanded });
    if (!expanded) continue;
    for (const effect of layer.effects)
      output.push({
        kind: "effect",
        key: `${layer.id}:fx:${effect.id}`,
        layer,
        depth: depth + 1,
        effectId: effect.id,
      });
    if (layer.mask) output.push({ kind: "mask", key: `${layer.id}:mask`, layer, depth: depth + 1 });
    const nested = children.get(layer.id) ?? [];
    for (const child of nested) pending.push({ layer: child, depth: depth + 1 });
  }
  return output;
}
export function flattenLayerTree(
  layers: readonly Layer[],
  parentId: string | null = null,
): Layer[] {
  const children = new Map<string | null, Layer[]>();
  for (const layer of layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }
  const pending = [...(children.get(parentId) ?? [])],
    result: Layer[] = [];
  while (pending.length) {
    const layer = pending.pop()!;
    result.push(layer);
    pending.push(...(children.get(layer.id) ?? []));
  }
  return result;
}
