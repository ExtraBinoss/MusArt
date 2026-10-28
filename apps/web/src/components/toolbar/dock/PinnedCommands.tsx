import { useEffect, useMemo, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../shared/IconButton";
import { Separator } from "../../ui/separator";
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
  const drag = useDockDrag(ids, commands),
    reduced = useReducedMotion();
  const catalog = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  );
  useEffect(() => {
    initialize();
  }, [initialize]);
  function drop(event: Parameters<typeof drag.drop>[0]) {
    if (drag.drop(event)) setAnnouncement(t("dock:reordered"));
  }
  return (
    <>
      {drag.ids.length > 0 && <Separator />}
      <div
        className="dock-pinned"
        aria-label={t("dock:pinned")}
        role="group"
        onDragOver={drag.overViewport}
        onDrop={drop}
      >
        {drag.ids.map((id) => {
          const command = catalog.get(id);
          if (!command) return null;
          const Icon = getSearchIcon(command);
          return (
            <motion.div
              key={id}
              layout={!reduced && !!drag.dragging ? "position" : false}
              transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.65 }}
              data-dock-command={id}
              data-dragging={drag.dragging === id || undefined}
              draggable
              onDragStartCapture={(event) => drag.start(event, id)}
              onDragOver={(event) => drag.over(event, id)}
              onDrop={drop}
              onDragEndCapture={drag.cancel}
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
