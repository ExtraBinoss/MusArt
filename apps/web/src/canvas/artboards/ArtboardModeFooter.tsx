import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import type { EnginePort } from "@musart/core";
import { CompositionMode } from "../../components/motion/CompositionMode";
import { useDocumentSnapshot } from "../../state/session/use-document-snapshot";
import { timelineOpenAtom } from "../../state/motion/timeline-state";
import { createViewportActions } from "../session/viewport-actions";
import type { View } from "../viewport/view";
import type { ArtboardWorkspace } from "./layout";
import { artboardFooterPosition } from "./footer-layout";

export function ArtboardModeFooter({
  engine,
  workspace,
  view,
}: {
  engine: EnginePort;
  workspace: ArtboardWorkspace;
  view: View;
}) {
  const snapshot = useDocumentSnapshot(engine);
  const board = workspace.boards.find((item) => item.id === snapshot.pageId);
  const setOpen = useSetAtom(timelineOpenAtom);
  const fit = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (fit.current !== null) cancelAnimationFrame(fit.current);
    },
    [],
  );
  if (!board) return null;
  return (
    <div
      className="artboard-mode-footer floating-panel"
      data-artboard-id={board.id}
      data-compact={board.width * view.zoom < 180}
      data-canvas-control
      style={{ transform: artboardFooterPosition(board, workspace, view) }}
    >
      <CompositionMode
        engine={engine}
        snapshot={snapshot}
        onMotionEnabled={() => {
          setOpen(true);
          if (fit.current !== null) cancelAnimationFrame(fit.current);
          fit.current = requestAnimationFrame(() => {
            fit.current = null;
            createViewportActions(engine).run("fit");
          });
        }}
      />
    </div>
  );
}
