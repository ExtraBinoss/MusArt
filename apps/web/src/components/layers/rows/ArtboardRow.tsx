import { memo, type DragEvent } from "react";
import { ChevronRight, Frame } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import { IconButton } from "../../shared/IconButton";
import { activateLayerPage } from "../tree/activation";
import "../messages";

export const ArtboardRow = memo(function ArtboardRow({
  engine,
  page,
  active,
  expanded,
  top,
  onToggle,
  onDragReject,
}: {
  engine: EnginePort;
  page: Composition;
  active: boolean;
  expanded: boolean;
  top: number;
  onToggle: (id: string) => void;
  onDragReject?: (event: DragEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={expanded}
      aria-current={active ? "page" : undefined}
      aria-label={t("layerControls:artboardLayers", { name: page.name, count: page.layers.length })}
      tabIndex={0}
      data-artboard-id={page.id}
      data-layer-tree-key={`artboard:${page.id}`}
      className={`layer-artboard-row ${active ? "is-active" : ""}`}
      style={{ position: "absolute", left: 0, right: 0, top }}
      onClick={() => activateLayerPage(engine, page)}
      onContextMenu={() => activateLayerPage(engine, page)}
      onDragOver={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onDragEnter={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateLayerPage(engine, page);
        }
        if ((event.key === "ArrowLeft" && expanded) || (event.key === "ArrowRight" && !expanded)) {
          event.preventDefault();
          onToggle(page.id);
        }
      }}
    >
      <span onClick={(event) => event.stopPropagation()}>
        <IconButton
          label={t(`layerControls:${expanded ? "collapseArtboard" : "expandArtboard"}`, {
            name: page.name,
          })}
          onClick={() => onToggle(page.id)}
        >
          <ChevronRight size={12} className="layer-chevron-icon" data-expanded={expanded} />
        </IconButton>
      </span>
      <Frame size={14} aria-hidden="true" />
      <span className="layer-name">{page.name}</span>
      <span className="small-count">{page.layers.length}</span>
    </div>
  );
});
