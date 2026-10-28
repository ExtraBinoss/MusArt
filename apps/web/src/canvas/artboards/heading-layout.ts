import type { ArtboardWorkspace } from "./layout";
import type { View } from "../viewport/view";

export interface ArtboardHeadingPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  compact: boolean;
  stem: number;
}
export const HEADING_HEIGHT = 26;
const GAP = 4;

/** Keep labels legible in screen pixels, stacking crowded labels above their own board. */
export function layoutArtboardHeadings(
  workspace: ArtboardWorkspace,
  view: View,
): ArtboardHeadingPlacement[] {
  const placed: ArtboardHeadingPlacement[] = [];
  for (const board of workspace.boards) {
    const x = view.x + (board.x - workspace.width / 2) * view.zoom,
      naturalY = view.y + (board.y - workspace.height / 2) * view.zoom - 32,
      width = Math.max(96, board.width * view.zoom);
    let y = naturalY,
      collision: ArtboardHeadingPlacement | undefined;
    do {
      collision = placed.find(
        (other) =>
          x < other.x + other.width + GAP &&
          x + width + GAP > other.x &&
          y < other.y + HEADING_HEIGHT + GAP &&
          y + HEADING_HEIGHT + GAP > other.y,
      );
      if (collision) y = collision.y - HEADING_HEIGHT - GAP;
    } while (collision);
    placed.push({ id: board.id, x, y, width, compact: width < 220, stem: naturalY - y + 6 });
  }
  return placed;
}
