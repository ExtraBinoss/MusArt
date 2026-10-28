import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";
import type { EnginePort } from "@musart/core";
import type { View } from "../viewport/view";
import type { ArtboardWorkspace } from "./layout";
import { artboardStyle } from "./presentation";
import { useArtboardPreviews, type ArtboardServices } from "./use-previews";
import "./messages";

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
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const boards = workspace.boards.filter((board) => board.id !== activeId);
  const previews = useArtboardPreviews(
    viewport,
    projectId,
    boards.map((board) => board.id),
    services,
  );
  return boards.map((board) => {
    const image = previews.items.find((item) => item.pageId === board.id);
    const failed = previews.failed || !!(image && broken.has(image.url));
    return (
      <div
        key={board.id}
        className="canvas-artboard canvas-artboard-inactive"
        data-artboard-id={board.id}
        data-active="false"
        style={artboardStyle(board, workspace, view)}
        role="button"
        tabIndex={0}
        aria-label={t("activate", { name: board.name })}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            engine.setPage(board.id);
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
          <span className="artboard-preview-state" style={{ transform: `scale(${1 / view.zoom})` }}>
            {!failed && <LoaderCircle size={16} className="animate-spin" />}
            <span>{t(failed ? "unavailable" : "preparing")}</span>
          </span>
        )}
      </div>
    );
  });
}
