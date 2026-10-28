/** A thumbnail is a temporary backdrop, never a second copy beneath transparent GPU pixels. */
export function syncArtboardBackdrops(viewport: Element | null): void {
  if (!viewport) return;
  const canvas = viewport.querySelector<HTMLCanvasElement>(".canvas-artboard-editor canvas");
  for (const board of viewport.querySelectorAll<HTMLElement>(
    '.canvas-artboard-backdrop[data-backdrop-active="true"]',
  )) {
    const covered = Boolean(
      canvas &&
      canvas.style.visibility === "visible" &&
      canvas.dataset.presentationReady === "true" &&
      canvas.dataset.pageId === board.dataset.artboardId &&
      canvas.dataset.projectId === board.dataset.projectId,
    );
    const next = String(covered);
    if (board.dataset.gpuCovered !== next) board.dataset.gpuCovered = next;
  }
}
