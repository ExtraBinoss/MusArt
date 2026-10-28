import { useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useSetAtom, useStore } from "jotai";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { PinOff } from "lucide-react";
import { IconButton } from "../../shared/IconButton";
import { Separator } from "../../ui/separator";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import type { SearchItem } from "../../search/catalog/model";
import { getSearchIcon } from "../../search/icons";
import { modifierLabel } from "../../search/shortcuts";
import { DockCustomizer } from "./DockCustomizer";
import { dockCommandsAtom, initializeDockAtom } from "./preferences";
import { useDockDrag } from "./use-dock-drag";
import "./messages";
import "./dock.css";
export function PinnedCommands({
  commands,
  run,
}: {
  commands: readonly SearchItem[];
  run: (id: string) => void;
}) {
  const { t } = useTranslation(),
    [ids, setIds] = useAtom(dockCommandsAtom),
    initialize = useSetAtom(initializeDockAtom);
  const [announcement, setAnnouncement] = useState("");
  const store = useStore(),
    group = useRef<HTMLDivElement>(null),
    focusAfterUnpin = useRef<number | null>(null);
  const drag = useDockDrag(ids, commands),
    reduced = useReducedMotion();
  const catalog = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  );
  useEffect(() => {
    initialize();
  }, [initialize]);
  useEffect(() => {
    if (focusAfterUnpin.current === null) return;
    const rows = group.current?.querySelectorAll<HTMLElement>("[data-dock-command]");
    const row = rows?.[Math.min(focusAfterUnpin.current, rows.length - 1)];
    focusAfterUnpin.current = null;
    (
      row?.querySelector<HTMLButtonElement>("button:not([disabled])") ??
      row ??
      group.current
    )?.focus();
  }, [ids]);
  function drop(event: Parameters<typeof drag.drop>[0]) {
    if (drag.drop(event)) setAnnouncement(t("dock:reordered"));
  }
  return (
    <>
      {drag.ids.length > 0 && <Separator />}
      <div
        ref={group}
        className="dock-pinned"
        aria-label={t("dock:pinned")}
        role="group"
        tabIndex={-1}
        onDragOver={drag.overViewport}
        onDragEnter={drag.overViewport}
        onDrop={drop}
      >
        {ids.map((id) => {
          const command = catalog.get(id);
          if (!command) return null;
          const Icon = getSearchIcon(command);
          return (
            <ContextMenu key={id} onOpenChange={(open) => open && drag.cancel()}>
              <ContextMenuTrigger asChild>
                <motion.div
                  layout={!reduced && !!drag.dragging ? "position" : false}
                  transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.65 }}
                  data-dock-command={id}
                  data-dragging={drag.dragging === id || undefined}
                  style={{ order: drag.ids.indexOf(id) }}
                  tabIndex={command.disabled ? 0 : -1}
                  role="group"
                  aria-label={t("dock:options", { name: command.label })}
                  aria-haspopup="menu"
                  draggable
                  onDragStartCapture={(event) => drag.start(event, id)}
                  onDragOver={(event) => drag.over(event, id)}
                  onDrop={drop}
                  onDragEndCapture={drag.cancel}
                  onKeyDown={(event) => {
                    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    event.currentTarget.dispatchEvent(
                      new MouseEvent("contextmenu", {
                        bubbles: true,
                        cancelable: true,
                        clientX: bounds.right,
                        clientY: bounds.top + bounds.height / 2,
                      }),
                    );
                  }}
                >
                  <IconButton
                    label={command.label}
                    disabled={Boolean(command.disabled)}
                    shortcut={command.shortcut
                      ?.map((key) => (key === "Mod" ? modifierLabel() : key))
                      .join("+")}
                    onClick={() => run(id)}
                  >
                    <Icon strokeWidth={1.65} />
                  </IconButton>
                </motion.div>
              </ContextMenuTrigger>
              <ContextMenuContent className="floating-panel">
                <ContextMenuItem
                  onSelect={() => {
                    drag.cancel();
                    const current = store.get(dockCommandsAtom);
                    focusAfterUnpin.current = current.indexOf(id);
                    setIds(current.filter((value) => value !== id));
                    setAnnouncement(t("dock:unpinned", { name: command.label }));
                  }}
                >
                  <PinOff size={14} />
                  {t("dock:unpin", { name: command.label })}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      <Separator />
      <DockCustomizer
        ids={ids}
        commands={commands}
        onChange={(value) => {
          drag.cancel();
          setIds(value);
        }}
      />
      {announcement && (
        <span className="sr-only" role="status">
          {announcement}
        </span>
      )}
    </>
  );
}
