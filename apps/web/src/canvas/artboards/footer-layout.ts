import type { ArtboardPlacement, ArtboardWorkspace } from "./layout";
import type { View } from "../viewport/view";

/** Controls stay in screen pixels immediately below their own composition. */
export function artboardFooterPosition(
  board: ArtboardPlacement,
  workspace: ArtboardWorkspace,
  view: View,
) {
  const x = view.x + (board.x + board.width / 2 - workspace.width / 2) * view.zoom;
  const y = view.y + (board.y + board.height - workspace.height / 2) * view.zoom + 12;
  return `translate3d(${x}px, ${y}px, 0) translateX(-50%)`;
}
