import { useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Download, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { requestCompositionExport } from "../../components/export/composition-request";
import type { EnginePort } from "@musart/core";
import { Button } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { Input } from "../../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import type { ArtboardPlacement, ArtboardWorkspace } from "./layout";
import type { View } from "../viewport/view";
import { layoutArtboardHeadings, type ArtboardHeadingPlacement } from "./heading-layout";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../interaction/gesture-origin";
import "./messages";
import { AddArtboardOverlay } from "./AddArtboardOverlay";
import type { SceneController } from "../session/scene-controller";

function ArtboardHeading({
  board,
  workspace,
  active,
  placement,
  engine,
  onError,
  controller,
}: {
  board: ArtboardPlacement;
  workspace: ArtboardWorkspace;
  active: boolean;
  placement: ArtboardHeadingPlacement;
  engine: EnginePort;
  onError?: (message: string) => void;
  controller?: SceneController;
}) {
  const { t } = useTranslation("artboards");
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(board.name);
  const done = useRef(false);
  const exporting = useRef(false);
  const origin = useRef<GestureOrigin | null>(null);
  const edit = () => {
    engine.setPage(board.id);
    origin.current = captureGestureOrigin(engine);
    setName(board.name);
    done.current = false;
    setEditing(true);
  };
  const commit = (cancel = false) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (
      cancel ||
      !name.trim() ||
      name.trim() === board.name ||
      !origin.current ||
      !isGestureOriginCurrent(engine, origin.current)
    )
      return;
    try {
      engine.setPage(board.id);
      engine.execute({ type: "updatePage", patch: { name: name.trim() } });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div
      className="artboard-heading"
      data-artboard-id={board.id}
      data-active={active}
      data-compact={placement.compact}
      data-displaced={placement.stem > 6}
      data-canvas-control
      style={
        {
          transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`,
          width: placement.width,
          maxWidth: placement.width,
          "--artboard-stem": `${placement.stem}px`,
        } as CSSProperties
      }
    >
      {editing ? (
        <Input
          autoFocus
          value={name}
          aria-label={t("name")}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              commit(event.key === "Escape");
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="artboard-name"
          aria-label={t("activate", { name: board.name })}
          onClick={() => engine.setPage(board.id)}
          onDoubleClick={edit}
        >
          {board.name}
        </button>
      )}
      <span className="artboard-dimensions">
        {board.width} × {board.height}
      </span>
      {active && <AddArtboardOverlay engine={engine} controller={controller} onError={onError} />}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                className="artboard-options"
                size="icon"
                variant="ghost"
                aria-label={t("options", { name: board.name })}
              >
                <Ellipsis size={14} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className="floating-panel">{t("optionsHint")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          data-canvas-control
          onCloseAutoFocus={(event) => {
            if (editing || exporting.current) event.preventDefault();
            exporting.current = false;
          }}
        >
          <DropdownMenuItem onSelect={edit}>
            <Pencil />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              exporting.current = true;
              requestCompositionExport(engine, board.id);
            }}
          >
            <Download />
            {t("export")}
          </DropdownMenuItem>
          {placement.compact && (
            <DropdownMenuLabel className="artboard-menu-dimensions">
              {board.width} × {board.height} px
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={workspace.boards.length < 2}
            onSelect={() => {
              try {
                engine.execute({ type: "deletePage", id: board.id });
              } catch (error) {
                onError?.(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            <Trash2 />
            {t("remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ArtboardHeadings({
  workspace,
  activeId,
  view,
  ...props
}: {
  workspace: ArtboardWorkspace;
  activeId: string;
  view: View;
  engine: EnginePort;
  onError?: (message: string) => void;
  controller?: SceneController;
}) {
  const headings = layoutArtboardHeadings(workspace, view);
  return workspace.boards.map((board) => (
    <ArtboardHeading
      key={board.id}
      board={board}
      workspace={workspace}
      active={board.id === activeId}
      placement={headings.find((heading) => heading.id === board.id)!}
      {...props}
    />
  ));
}
