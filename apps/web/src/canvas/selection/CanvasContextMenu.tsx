import { CanvasMenuItems } from "./CanvasMenuItems";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getMotionOccurrenceAt,
  type EnginePort,
  type Project,
  type SessionSnapshot,
} from "@musart/core";
import type { Point } from "../viewport/view";
import type { CanvasContextTarget } from "../interaction/transfers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  requestLayerTransition,
  getTransitionRequests,
} from "../../components/motion/transitions/requests";
import { attachmentSelection } from "../../state/selection/attachments";
import "../../components/motion/transitions/messages";
import { createMotionTransport } from "../../services/motion/transport";

interface MenuScope {
  engine: EnginePort;
  project: Project;
  revision: number;
  point: Point;
  target: CanvasContextTarget | null;
  compositionId: string;
  selection: string[];
  trackId?: string;
}
/** Right-click releases open the menu; a right-button marquee remains a real canvas gesture. */
export function CanvasContextMenu({
  engine,
  resolveTarget,
  onError,
  children,
}: {
  engine: EnginePort;
  resolveTarget: (point: Point) => CanvasContextTarget | null;
  onError?: (message: string) => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<MenuScope | null>(null);
  const right = useRef<{
    pointer: number;
    point: Point;
    project: Project;
    revision: number;
    moved: boolean;
  } | null>(null);
  const mounted = useRef(0),
    focus = useRef<HTMLElement | null>(null);
  const pending = useRef<{ scope: MenuScope; generation: number } | null>(null);
  useEffect(() => {
    const generation = mounted.current + 1;
    mounted.current = generation;
    pending.current = null;
    focus.current = null;
    return () => {
      mounted.current = generation + 1;
      right.current = null;
      pending.current = null;
      focus.current = null;
    };
  }, [engine]);
  function isCurrent(scope: MenuScope) {
    const current = engine.getSnapshot();
    return (
      scope.engine === engine &&
      current.project === scope.project &&
      current.revision === scope.revision &&
      current.pageId === scope.compositionId &&
      current.selection.length === scope.selection.length &&
      current.selection.every((id) => scope.selection.includes(id))
    );
  }
  function open(
    point: Point,
    scope: Pick<SessionSnapshot, "project" | "revision"> = engine.getSnapshot(),
  ) {
    const current = engine.getSnapshot();
    if (current.project !== scope.project || current.revision !== scope.revision) return;
    const target = resolveTarget(point);
    const transport = createMotionTransport(engine);
    transport.pause();
    const compositionId = target?.compositionId ?? current.pageId;
    if (current.pageId !== compositionId) engine.setPage(compositionId);
    const page = current.project.pages.find((page) => page.id === compositionId);
    const trackId =
      target && page?.motion?.mode === "motion"
        ? getMotionOccurrenceAt(page, target.layerId, transport.read().time, {
            terminalPreview: true,
          })?.id
        : undefined;
    attachmentSelection(engine).clear();
    const selected = engine.getSnapshot().selection;
    engine.select(target ? (selected.includes(target.layerId) ? selected : [target.layerId]) : []);
    pending.current = null;
    setMenu({
      engine,
      project: current.project,
      revision: current.revision,
      point,
      target,
      compositionId,
      selection: [...engine.getSnapshot().selection],
      trackId,
    });
  }
  return (
    <div
      style={{ display: "contents" }}
      onPointerDownCapture={(event) => {
        if (
          event.button !== 2 ||
          !event.currentTarget.contains(event.target as Node) ||
          (event.target as HTMLElement).closest("[data-canvas-control]")
        )
          return;
        const scope = engine.getSnapshot();
        right.current = {
          pointer: event.pointerId,
          point: { x: event.clientX, y: event.clientY },
          project: scope.project,
          revision: scope.revision,
          moved: false,
        };
        focus.current = (event.target as HTMLElement).closest<HTMLElement>(".editor-canvas");
      }}
      onPointerCancelCapture={() => {
        right.current = null;
      }}
      onPointerMoveCapture={(event) => {
        const held = right.current;
        if (
          held?.pointer === event.pointerId &&
          Math.hypot(event.clientX - held.point.x, event.clientY - held.point.y) > 3
        )
          held.moved = true;
      }}
      onPointerUpCapture={(event) => {
        const held = right.current;
        if (!held || event.pointerId !== held.pointer) return;
        right.current = null;
        if (
          held.moved ||
          Math.hypot(event.clientX - held.point.x, event.clientY - held.point.y) > 3
        )
          return;
        const generation = mounted.current,
          point = { x: event.clientX, y: event.clientY };
        queueMicrotask(() => {
          if (mounted.current === generation) open(point, held);
        });
      }}
      onContextMenu={(event) => {
        if (
          !event.currentTarget.contains(event.target as Node) ||
          (event.target as HTMLElement).closest("[data-canvas-control]")
        )
          return;
        event.preventDefault();
        // Pointer menus are deferred until release so a drag never opens a menu midway.
        if (event.button !== 2 && !right.current) open({ x: event.clientX, y: event.clientY });
      }}
    >
      {children}
      <DropdownMenu
        open={!!menu && menu.engine === engine}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="canvas-context-anchor"
            style={{
              position: "fixed",
              left: menu?.point.x ?? 0,
              top: menu?.point.y ?? 0,
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={0}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const action = pending.current;
            pending.current = null;
            // Modal content survives its close animation. Hand the captured action to the
            // persistent host only when Radix actually releases this menu's focus scope.
            if (
              action &&
              action.scope.target &&
              action.generation === mounted.current &&
              isCurrent(action.scope)
            ) {
              const { target, point, trackId } = action.scope;
              void requestLayerTransition(
                engine,
                target.compositionId,
                target.layerId,
                point,
                trackId,
              ).catch((error: unknown) =>
                onError?.(error instanceof Error ? error.message : String(error)),
              );
              return;
            }
            if (!getTransitionRequests(engine).read())
              focus.current?.focus({ preventScroll: true });
          }}
        >
          {menu && (
            <CanvasMenuItems
              engine={engine}
              page={menu.project.pages.find((page) => page.id === menu.compositionId)!}
              selection={menu.selection}
              layerId={menu.target?.layerId}
              current={() => isCurrent(menu)}
              onError={onError}
              motion={() => {
                if (isCurrent(menu)) pending.current = { scope: menu, generation: mounted.current };
              }}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
