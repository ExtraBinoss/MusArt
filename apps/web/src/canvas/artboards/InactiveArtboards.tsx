import {
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { CommandCommitInfo, EnginePort, Project } from "@musart/core";
import type { View } from "../viewport/view";
import type { ArtboardWorkspace } from "./layout";
import { artboardStyle } from "./presentation";
import { useArtboardPreviews, type ArtboardServices } from "./use-previews";
import { syncArtboardBackdrops } from "./backdrop-presentation";
import "./messages";

interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}
function summaryObservable(engine: EnginePort): engine is SummaryEngine {
  return "subscribeCommitInfo" in engine && typeof engine.subscribeCommitInfo === "function";
}

export function InactiveArtboards({
  engine,
  workspace,
  activeId,
  projectId,
  view,
  viewport,
  services,
}: {
  engine: EnginePort;
  workspace: ArtboardWorkspace;
  activeId: string;
  projectId: string;
  view: View;
  viewport: RefObject<HTMLDivElement | null>;
  services?: ArtboardServices;
}) {
  const { t } = useTranslation("artboards");
  const [loadVersion, replaceScope] = useReducer((value: number) => value + 1, 0);
  const scope = useRef<Project | null>(null);
  useLayoutEffect(() => {
    syncArtboardBackdrops(viewport.current);
  }, [activeId, projectId, loadVersion, viewport]);
  useLayoutEffect(() => {
    const current = engine.getSnapshot().project;
    scope.current = current.id === projectId ? current : null;
    if (!summaryObservable(engine)) {
      let observed = current;
      // A minimal EnginePort cannot distinguish load from paint. Rebind only after
      // a fresh local render, rather than adopting an unknown replacement synchronously.
      return engine.subscribe(() => {
        const next = engine.getSnapshot().project;
        if (next === observed) return;
        observed = next;
        scope.current = null;
        replaceScope();
      });
    }
    return engine.subscribeCommitInfo((event) => {
      if (event.kind === "load") {
        scope.current = null;
        replaceScope();
      } else if (scope.current && event.snapshot.project.id === projectId) {
        // Paint-only commits need no React canvas render, but keep keyboard navigation current.
        scope.current = event.snapshot.project;
      }
    });
  }, [engine, projectId, workspace, loadVersion]);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const boards = workspace.boards;
  const backgrounds = new Map(
    engine.getSnapshot().project.pages.map((page) => [page.id, page.background]),
  );
  const previews = useArtboardPreviews(
    viewport,
    projectId,
    boards.map((board) => board.id),
    services,
  );
  return boards.map((board) => {
    const image = previews.items.find((item) => item.pageId === board.id);
    const failed = !!(image && broken.has(image.url));
    const active = board.id === activeId;
    return (
      <div
        key={board.id}
        className={`canvas-artboard canvas-artboard-backdrop${active ? "" : " canvas-artboard-inactive"}`}
        data-artboard-id={board.id}
        data-project-id={projectId}
        data-active="false"
        data-backdrop-active={active}
        data-preview-available={Boolean(image && !failed)}
        data-preview-current={Boolean(image && !failed && !image.stale)}
        style={
          {
            ...artboardStyle(board, workspace, view),
            "--artboard-background": backgrounds.get(board.id) ?? "transparent",
          } as CSSProperties
        }
        role={active ? undefined : "button"}
        tabIndex={active ? undefined : 0}
        aria-hidden={active || undefined}
        aria-label={active ? undefined : t("activate", { name: board.name })}
        aria-busy={(!image || !!image.stale) && !previews.failed}
        onKeyDown={(event) => {
          if (!active && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            const current = engine.getSnapshot(),
              page = current.project.pages.find((item) => item.id === board.id);
            if (
              scope.current !== current.project ||
              current.project.id !== projectId ||
              !page ||
              page.name !== board.name ||
              page.width !== board.width ||
              page.height !== board.height
            )
              return;
            engine.setPage(board.id);
            viewport.current?.focus();
          }
        }}
      >
        {image && !failed ? (
          <img
            src={image.url}
            alt={board.name}
            draggable={false}
            onError={() => setBroken((previous) => new Set([...previous, image.url].slice(-32)))}
          />
        ) : (
          <span className="sr-only">
            {t(failed || previews.failed ? "unavailable" : "preparing")}
          </span>
        )}
      </div>
    );
  });
}
