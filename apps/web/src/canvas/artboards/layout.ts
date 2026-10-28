import type { View, Point } from "../viewport/view";

export interface ArtboardGeometry {
  id: string;
  name: string;
  width: number;
  height: number;
}
export interface ArtboardPlacement extends ArtboardGeometry {
  x: number;
  y: number;
}
export interface ArtboardWorkspace {
  width: number;
  height: number;
  boards: ArtboardPlacement[];
}
export const ARTBOARD_GAP = 128;

/** Stable two-column shelves keep new pages beside the preceding page. */
export function arrangeArtboards(pages: readonly ArtboardGeometry[]): ArtboardWorkspace {
  const boards: ArtboardPlacement[] = [];
  let width = 0,
    height = 0,
    y = 0;
  for (let index = 0; index < pages.length; index += 2) {
    let x = 0,
      rowHeight = 0;
    for (const page of pages.slice(index, index + 2)) {
      boards.push({ ...page, x, y });
      width = Math.max(width, x + page.width);
      height = Math.max(height, y + page.height);
      rowHeight = Math.max(rowHeight, page.height);
      x += page.width + ARTBOARD_GAP;
    }
    y += rowHeight + ARTBOARD_GAP;
  }
  return { width, height, boards };
}

/** Existing page-local tools receive the active board's world-space center. */
export function viewForArtboard(
  view: View,
  workspace: ArtboardWorkspace,
  board: ArtboardPlacement,
): View {
  return {
    x: view.x + (board.x + board.width / 2 - workspace.width / 2) * view.zoom,
    y: view.y + (board.y + board.height / 2 - workspace.height / 2) * view.zoom,
    zoom: view.zoom,
  };
}

export function artboardAt(
  workspace: ArtboardWorkspace,
  point: Point,
): ArtboardPlacement | undefined {
  return workspace.boards.find(
    (board) =>
      point.x >= board.x &&
      point.x <= board.x + board.width &&
      point.y >= board.y &&
      point.y <= board.y + board.height,
  );
}
