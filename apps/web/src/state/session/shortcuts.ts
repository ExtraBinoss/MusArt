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
import { pixelSelectionShortcut } from "../../services/selection/wand/shortcuts";
import { attachmentSelection } from "../selection/attachments";
import {
  createClipboardController,
  nativeClipboardShortcut,
} from "../../services/clipboard/controller";

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
  useEffect(
    () =>
      createClipboardController(engine).retain({
        enabled: () => latest.current.engine === engine && latest.current.enabled,
        onError: (error) => {
          void latest.current.onTask(() => {
            throw error;
          });
        },
      }),
    [engine],
  );
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
      if (
        !attachmentSelection(engine).read() &&
        pixelSelectionShortcut(event, services.pixelSelection, onTask, command)
      )
        return;
      if (!command) return;
      const target = event.target;
      const capture =
        target instanceof HTMLElement ? target.closest("[data-keybinding-capture]") : null;
      const documentScope = Boolean(
        capture?.hasAttribute("data-document-shortcuts") &&
        (command === "action:undo" ||
          command === "action:redo" ||
          command === "action:save" ||
          command === "action:togglePlayback"),
      );
      if (capture && !documentScope) return;
      if (command !== "action:save" && isEditingShortcutTarget(target, { documentScope })) return;
      if (nativeClipboardShortcut(command, event)) return;
      // A held app shortcut remains owned even when its action must not repeat.
      // Letting it fall through here can invoke the browser's Ctrl/Cmd+R reload.
      if (event.repeat && !command.startsWith("nudge:")) {
        event.preventDefault();
        return;
      }
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
