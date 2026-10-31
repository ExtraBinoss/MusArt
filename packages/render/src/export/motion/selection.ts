import { selectionComposition, type Composition } from "@musart/core";

/** Keep the authored selection's crop fixed across animation/replay instead of following its motion. */
export function selectionFrameScope(origin: Composition, selection?: readonly string[]) {
  if (!selection?.length) return { page: origin, frame: (page: Composition) => page };
  const base = selectionComposition(origin, selection);
  const root = base.layers.find(
    (layer) => !layer.parentId && origin.layers.some((item) => item.id === layer.id),
  )!;
  const original = origin.layers.find((layer) => layer.id === root.id)!;
  const left = original.x - root.x,
    top = original.y - root.y;
  return {
    page: base,
    frame(page: Composition): Composition {
      const ids = selection.filter((id) => page.layers.some((layer) => layer.id === id));
      if (!ids.length) return { ...base, layers: [] };
      const cropped = selectionComposition(page, ids);
      const currentRoot = cropped.layers.find(
        (layer) => !layer.parentId && page.layers.some((item) => item.id === layer.id),
      )!;
      const current = page.layers.find((layer) => layer.id === currentRoot.id)!;
      const dx = current.x - currentRoot.x - left,
        dy = current.y - currentRoot.y - top;
      return {
        ...cropped,
        width: base.width,
        height: base.height,
        layers: cropped.layers.map((layer) =>
          layer.parentId ? layer : { ...layer, x: layer.x + dx, y: layer.y + dy },
        ),
      };
    },
  };
}
