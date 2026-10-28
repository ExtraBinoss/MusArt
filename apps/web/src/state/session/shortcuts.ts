import { useEffect, useLayoutEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import type { EnginePort } from "@musart/core";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
} from "../../canvas/interaction/gesture-origin";
import { createCommandPort } from "../keybindings/command-port";
import { documentShortcut } from "../keybindings/document-actions";
import { isEditingShortcutTarget, matchBinding } from "../keybindings/matching";
import { keybindings } from "../keybindings/store";
import { previewAtom, toolAtom } from "./editor";
import type { EditorServices } from "../contracts";
import { i18n } from "../i18n";
import "../../components/search/keybindings/messages";

export function useShortcuts(
  engine: EnginePort,
  services: EditorServices,
  onTask: (task: () => void | Promise<void>) => Promise<boolean>,
  enabled = true,
) {
  const setTool = useSetAtom(toolAtom),
    setPreview = useSetAtom(previewAtom);
  const latest = useRef({ engine, services, onTask, enabled });
  useLayoutEffect(() => {
    latest.current = { engine, services, onTask, enabled };
  }, [engine, services, onTask, enabled]);
  useEffect(() => {
    const stopPreferences = keybindings.subscribe(() => {});
    const onKeyDown = (event: KeyboardEvent) => {
      const { engine, services, onTask, enabled } = latest.current;
      if (!enabled) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")
          event.preventDefault();
        return;
      }
      if (event.defaultPrevented || event.isComposing) return;
      const command = matchBinding(event, keybindings.readSnapshot());
      if (!command || (event.repeat && !command.startsWith("nudge:"))) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-keybinding-capture]")) return;
      if (command !== "action:save" && isEditingShortcutTarget(target)) return;
      const fallback = documentShortcut(command, { engine, save: services.saveProject, setTool });
      if (command === "action:undo" || command === "action:redo" || command === "action:deselect")
        setPreview(null);
      if (command === "action:deselect") setTool("pointer");
      if (createCommandPort(engine).run(command)) {
        event.preventDefault();
        return;
      }
      if (!fallback) return;
      event.preventDefault();
      const origin = captureGestureOrigin(engine);
      void onTask(() => {
        if (latest.current.engine !== engine || !isGestureOriginCurrent(engine, origin))
          throw new Error(i18n.t("keybindings:stale"));
        return fallback();
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      stopPreferences();
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [setPreview, setTool]);
}
