import type { Composition, Layer } from "../document/model";
import { createLayerGeometryIndex, type LayerGeometryIndex } from "../layers/geometry-index";
import { ensure } from "../errors";
function pixelEdge(value: number, round: (value: number) => number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= Number.EPSILON * 64 * Math.max(1, Math.abs(value))
    ? integer
    : round(value);
}
function selectionRoots(selected: ReadonlySet<string>, geometry: LayerGeometryIndex): string[] {
  const covered = new Map<string, boolean>();
  return [...selected].filter((id) => {
    const pending: string[] = [];
    let parent = geometry.get(id).parentId;
    while (parent && !selected.has(parent) && !covered.has(parent)) {
      pending.push(parent);
      parent = geometry.get(parent).parentId;
    }
    const inherited = parent !== null && (selected.has(parent) || covered.get(parent) === true);
    for (const ancestor of pending) covered.set(ancestor, inherited);
    return !inherited;
  });
}
function paintedLayers(roots: readonly string[], geometry: LayerGeometryIndex) {
  const painted = new Set<string>(),
    paths = new Set<string>();
  for (const id of roots) {
    let ancestor: string | null = id;
    while (ancestor && !paths.has(ancestor)) {
      paths.add(ancestor);
      painted.add(ancestor);
      ancestor = geometry.get(ancestor).parentId;
    }
  }
  const pending = [...roots],
    expanded = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (expanded.has(id)) continue;
    expanded.add(id);
    painted.add(id);
    for (const child of geometry.children(id)) pending.push(child.id);
  }
  return { painted, paths };
}
/** Dependency copies keep a full mask source independent of any partial painted copy. */
function maskDependencies(painted: ReadonlySet<string>, geometry: LayerGeometryIndex) {
  const pending: string[] = [],
    included = new Set<string>(),
    expanded = new Set<string>(),
    paths = new Set<string>();
  for (const id of painted) {
    const source = geometry.get(id).mask?.layerId;
    if (source) pending.push(source);
  }
  while (pending.length) {
    const root = pending.pop()!;
    ensure(geometry.byId.has(root), "NOT_FOUND", "Export mask source is missing");
    const descendants = [root];
    while (descendants.length) {
      const id = descendants.pop()!;
      if (expanded.has(id)) continue;
      expanded.add(id);
      included.add(id);
      const layer = geometry.get(id);
      if (layer.mask?.layerId) pending.push(layer.mask.layerId);
      for (const child of geometry.children(id)) descendants.push(child.id);
    }
    let ancestor = geometry.get(root).parentId;
    while (ancestor && !paths.has(ancestor)) {
      paths.add(ancestor);
      included.add(ancestor);
      const layer = geometry.get(ancestor);
      if (layer.mask?.layerId) pending.push(layer.mask.layerId);
      ancestor = layer.parentId;
    }
  }
  return included;
}
function dependencyCopies(
  page: Composition,
  included: ReadonlySet<string>,
  reservedIds: Iterable<string>,
) {
  if (!included.size) return { layers: [] as Layer[], ids: new Map<string, string>() };
  const reserved = new Set(reservedIds);
  reserved.add(page.id);
  for (const guide of page.guides) reserved.add(guide.id);
  for (const layer of page.layers) {
    reserved.add(layer.id);
    if (layer.assetId) reserved.add(layer.assetId);
    if (layer.mask?.assetId) reserved.add(layer.mask.assetId);
    for (const effect of layer.effects) reserved.add(effect.id);
    for (const guide of layer.guides ?? []) reserved.add(guide.id);
  }
  let sequence = 0;
  function allocate() {
    let id: string;
    do {
      id = `__musart_export_mask_${(++sequence).toString(36)}`;
    } while (reserved.has(id));
    reserved.add(id);
    return id;
  }
  const sources = page.layers.filter((layer) => included.has(layer.id));
  const ids = new Map(sources.map((layer) => [layer.id, allocate()]));
  const layers = sources.map((layer): Layer => ({
    ...layer,
    id: ids.get(layer.id)!,
    parentId: layer.parentId ? ids.get(layer.parentId)! : null,
    ...(!layer.parentId ? { maskSource: true } : {}),
    mask: layer.mask?.layerId
      ? { ...layer.mask, layerId: ids.get(layer.mask.layerId)! }
      : layer.mask,
    effects: layer.effects.map((effect) => ({ ...effect, id: allocate() })),
    ...(layer.guides
      ? { guides: layer.guides.map((guide) => ({ ...guide, id: allocate() })) }
      : {}),
  }));
  return { layers, ids };
}

/** Isolate painted subtrees and privately copy complete mask dependencies; assets stay referenced. */
export function selectionComposition(
  page: Composition,
  selection: readonly string[],
  reservedIds: Iterable<string> = [],
): Composition {
  const selected = new Set(selection);
  ensure(selected.size > 0, "INVALID_COMMAND", "Export selection is empty");
  const geometry = createLayerGeometryIndex(page);
  for (const id of selected) ensure(geometry.byId.has(id), "NOT_FOUND", "Export layer is missing");
  const roots = selectionRoots(selected, geometry);
  const { painted, paths } = paintedLayers(roots, geometry);
  const dependencies = dependencyCopies(page, maskDependencies(painted, geometry), reservedIds);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of roots) {
    const bounds = geometry.worldBounds(id);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  const left = pixelEdge(minX, Math.floor),
    top = pixelEdge(minY, Math.floor),
    right = pixelEdge(maxX, Math.ceil),
    bottom = pixelEdge(maxY, Math.ceil);
  const originals = page.layers
    .filter((layer) => painted.has(layer.id))
    .map((layer): Layer => ({
      ...layer,
      ...(paths.has(layer.id) && layer.maskSource ? { maskSource: false } : {}),
      mask: layer.mask?.layerId
        ? { ...layer.mask, layerId: dependencies.ids.get(layer.mask.layerId)! }
        : layer.mask,
    }));
  return {
    ...page,
    name: roots.length === 1 ? geometry.get(roots[0]!).name : page.name,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    background: "transparent",
    rulers: false,
    guides: [],
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    layers: [...dependencies.layers, ...originals].map((layer) =>
      layer.parentId ? layer : { ...layer, x: layer.x - left, y: layer.y - top },
    ),
  };
}
