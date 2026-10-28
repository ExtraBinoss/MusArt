import type { View } from "../viewport/view";
import { viewForArtboard, type ArtboardPlacement, type ArtboardWorkspace } from "./layout";
import { layoutArtboardHeadings } from "./heading-layout";

export function artboardStyle(board: ArtboardPlacement, workspace: ArtboardWorkspace, view: View) {
  const local = viewForArtboard(view, workspace, board);
  return {
    width: board.width,
    height: board.height,
    marginLeft: -board.width / 2,
    marginTop: -board.height / 2,
    transform: `translate3d(${local.x}px, ${local.y}px, 0) scale(${view.zoom})`,
  };
}

/** Shared imperative painting avoids React commits during wheel/trackpad motion. */
export function paintArtboards(root: HTMLElement, workspace: ArtboardWorkspace, view: View) {
  const headings = new Map(
    layoutArtboardHeadings(workspace, view).map((heading) => [heading.id, heading]),
  );
  for (const element of root.querySelectorAll<HTMLElement>("[data-artboard-id]")) {
    const board = workspace.boards.find((item) => item.id === element.dataset.artboardId);
    if (!board) continue;
    if (element.classList.contains("artboard-heading")) {
      const heading = headings.get(board.id)!;
      element.style.marginLeft = "0px";
      element.style.marginTop = "0px";
      element.style.transform = `translate3d(${heading.x}px, ${heading.y}px, 0)`;
      element.style.width = element.style.maxWidth = `${heading.width}px`;
      element.style.setProperty("--artboard-stem", `${heading.stem}px`);
      element.dataset.compact = String(heading.compact);
      element.dataset.displaced = String(heading.stem > 6);
      continue;
    }
    const style = artboardStyle(board, workspace, view);
    element.style.width = `${style.width}px`;
    element.style.height = `${style.height}px`;
    element.style.marginLeft = `${style.marginLeft}px`;
    element.style.marginTop = `${style.marginTop}px`;
    element.style.transform = style.transform;
  }
}
