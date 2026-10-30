import { useRef, type ReactElement } from "react";
import { Blend } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort, SessionSnapshot } from "@musart/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import { getTransitionRequests, requestLayerTransition } from "./requests";
import "./messages";

/** Use a DOM child or a forwarded-ref leaf; the permanent request host owns the resulting popover. */
export function LayerTransitionContext({
  engine,
  compositionId,
  layerId,
  children,
  interactive = true,
  onSelect,
  onError,
}: {
  engine: EnginePort;
  compositionId: string;
  layerId: string;
  children: ReactElement;
  interactive?: boolean;
  onSelect?: () => void;
  onError?: (error: unknown) => void;
}) {
  const { t } = useTranslation("transitions");
  const held = useRef<SessionSnapshot | null>(null),
    point = useRef<{ x: number; y: number } | undefined>(undefined);
  return (
    <ContextMenu
      modal={false}
      onOpenChange={(open) => {
        held.current = open ? engine.getSnapshot() : null;
        if (open) onSelect?.();
      }}
    >
      <ContextMenuTrigger
        asChild
        disabled={!interactive}
        onContextMenu={(event) => {
          point.current = { x: event.clientX, y: event.clientY };
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        data-canvas-control
        data-keybinding-capture
        onCloseAutoFocus={(event) => {
          if (getTransitionRequests(engine).read()) event.preventDefault();
        }}
      >
        <ContextMenuItem
          disabled={!interactive}
          onSelect={() => {
            const before = held.current,
              current = engine.getSnapshot();
            if (
              !before ||
              before.project !== current.project ||
              before.revision !== current.revision ||
              current.pageId !== compositionId
            )
              return;
            void requestLayerTransition(engine, compositionId, layerId, point.current).catch(
              (error: unknown) => onError?.(error),
            );
          }}
        >
          <Blend size={14} />
          {t("add")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
