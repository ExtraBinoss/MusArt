/** Highlight the committed source in the destination surface, or a collapsed receiving group. */
export function layerPlacementTargets(
  pageId: string,
  id: string,
  fallback: string,
  viewport?: HTMLElement | null,
) {
  const root = viewport?.isConnected ? viewport : document;
  const rows = [
    ...root.querySelectorAll<HTMLElement>(
      '[data-layer-drop-kind="layer"]:not([data-timeline-drop-target])',
    ),
  ].filter((node) => node.dataset.layerDropPageId === pageId);
  const source = rows.filter((node) => node.dataset.layerDropId === id);
  return source.length ? source : rows.filter((node) => node.dataset.layerDropId === fallback);
}
