import type { Composition, EnginePort } from "@musart/core";
import { artboardAt, type ArtboardWorkspace } from "../artboards/layout";
import { canvasHit } from "../selection/hit";
import { clientToPage, type Point, type View } from "../viewport/view";
import { createCanvasFileDropHandlers } from "./file-drop";

export interface CanvasContextTarget {
  readonly compositionId: string;
  readonly layerId: string;
  readonly locked: boolean;
}
interface CanvasTransfers {
  readonly engine: EnginePort;
  readonly readPage: () => Composition;
  readonly readWorkspace: () => ArtboardWorkspace;
  readonly readView: () => View;
  readonly readViewport: () => HTMLElement | null;
  readonly onActive: (active: boolean) => void;
  readonly onFiles?: (files: File[]) => void;
}
/** Native transfer and context targets share the actual world/artboard coordinate conversion. */
export function createCanvasTransfers(options: CanvasTransfers) {
  function locate(point: Point, element = options.readViewport()) {
    if (!element) return null;
    const world = options.readWorkspace();
    const position = clientToPage(
      point,
      element.getBoundingClientRect(),
      options.readView(),
      world,
    );
    const board = artboardAt(world, position);
    return board ? { board, position: { x: position.x - board.x, y: position.y - board.y } } : null;
  }
  return {
    target(point: Point): CanvasContextTarget | null {
      const located = locate(point);
      if (!located) return null;
      const presented = options.readPage();
      const page =
        presented.id === located.board.id
          ? presented
          : options.engine.getSnapshot().project.pages.find(({ id }) => id === located.board.id);
      const hit = page && canvasHit(page, located.position, true);
      return hit
        ? { compositionId: located.board.id, layerId: hit.layer.id, locked: hit.locked }
        : null;
    },
    files: createCanvasFileDropHandlers({
      onActive: options.onActive,
      onFiles(event, files) {
        const located = locate({ x: event.clientX, y: event.clientY }, event.currentTarget);
        if (located) options.engine.setPage(located.board.id);
        options.onFiles?.(files);
      },
    }),
  };
}
