import {
  copyContent,
  parseClipboard,
  pasteContent,
  MAX_CLIPBOARD_CHARACTERS,
  type EnginePort,
  type SessionSnapshot,
} from "@musart/core";
import { clipboardPreferences } from "../../state/clipboard/preferences";
import { i18n } from "../../state/i18n";
import { isEditingShortcutTarget, matchBinding } from "../../state/keybindings/matching";
import { keybindings } from "../../state/keybindings/store";
import { attachmentSelection } from "../../state/selection/attachments";
import "./messages";

function failure(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  const key = /originals are missing/.test(message)
    ? "missingImages"
    : /too large/.test(message)
      ? "tooLarge"
      : /selection is empty/.test(message)
        ? "empty"
        : "invalid";
  return new Error(i18n.t(`clipboard:${key}`), { cause: error });
}

export function nativeClipboardShortcut(command: string, event: KeyboardEvent): boolean {
  return (
    (command === "action:copy" || command === "action:paste") &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === (command === "action:copy" ? "c" : "v")
  );
}

/** A bounded format claim keeps editable clipboard JSON out of the plain-text import adapter. */
export function isMusArtClipboardText(text: string): boolean {
  const candidate = text.slice(0, MAX_CLIPBOARD_CHARACTERS);
  return /^\s*\{/.test(candidate) && /"format"\s*:\s*"musart\.clipboard"/.test(candidate);
}

/** Native copy/paste events need no clipboard permission; alternate command bindings use the API. */
export class ClipboardController {
  private pointer: { x: number; y: number } | null = null;
  private generation = 0;
  private users = 0;
  private retained = false;
  constructor(private readonly engine: EnginePort) {}
  private serialize(composition = false) {
    try {
      return copyContent(this.engine.getSnapshot(), {
        includeImages: clipboardPreferences.read().includeImages,
        composition,
      });
    } catch (error) {
      throw failure(error);
    }
  }
  async copy(composition = false): Promise<void> {
    const text = this.serialize(composition);
    if (!navigator.clipboard?.writeText) throw new Error(i18n.t("clipboard:unavailable"));
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      throw new Error(i18n.t("clipboard:writeFailed"), { cause: error });
    }
  }
  async paste(): Promise<void> {
    if (this.retained && !this.users) throw new Error(i18n.t("clipboard:stale"));
    const generation = this.generation;
    const origin = this.engine.getSnapshot();
    if (!navigator.clipboard?.readText) throw new Error(i18n.t("clipboard:unavailable"));
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch (error) {
      throw new Error(i18n.t("clipboard:readFailed"), { cause: error });
    }
    if (generation !== this.generation) throw new Error(i18n.t("clipboard:stale"));
    this.insert(text, origin);
  }
  private position(snapshot: SessionSnapshot) {
    const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
    const board = [...document.querySelectorAll<HTMLElement>(".canvas-artboard-editor")].find(
      (element) => element.dataset.artboardId === page.id,
    );
    if (board && this.pointer) {
      const rect = board.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        this.pointer.x >= rect.left &&
        this.pointer.x <= rect.right &&
        this.pointer.y >= rect.top &&
        this.pointer.y <= rect.bottom
      )
        return {
          x: ((this.pointer.x - rect.left) * page.width) / rect.width,
          y: ((this.pointer.y - rect.top) * page.height) / rect.height,
        };
    }
    return { x: page.width / 2, y: page.height / 2 };
  }
  private insert(text: string, origin: SessionSnapshot) {
    const current = this.engine.getSnapshot();
    if (
      current.project !== origin.project ||
      current.pageId !== origin.pageId ||
      current.revision !== origin.revision
    )
      throw new Error(i18n.t("clipboard:stale"));
    let plan: ReturnType<typeof pasteContent>;
    try {
      plan = pasteContent(
        parseClipboard(text, current.project),
        current.project,
        this.position(current),
        () => crypto.randomUUID(),
      );
    } catch (error) {
      throw failure(error);
    }
    this.engine.transaction(plan.commands);
    if (plan.pageId) this.engine.setPage(plan.pageId);
    attachmentSelection(this.engine).clear();
    this.engine.select(plan.selection);
  }
  retain(options: { enabled: () => boolean; onError: (error: unknown) => void }): () => void {
    this.retained = true;
    this.users++;
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".editor-canvas"))
        this.pointer = { x: event.clientX, y: event.clientY };
    };
    const allowed = (event: ClipboardEvent, action: "copy" | "paste") => {
      if (!options.enabled() || event.defaultPrevented || isEditingShortcutTarget(event.target))
        return false;
      const key = action === "copy" ? "c" : "v";
      return (
        matchBinding(
          new KeyboardEvent("keydown", { key, ctrlKey: true }),
          keybindings.readSnapshot(),
        ) === `action:${action}`
      );
    };
    const copy = (event: ClipboardEvent) => {
      if (
        !allowed(event, "copy") ||
        !event.clipboardData ||
        !this.engine.getSnapshot().selection.length
      )
        return;
      try {
        const text = this.serialize();
        event.clipboardData.setData("text/plain", text);
        event.preventDefault();
      } catch (error) {
        event.preventDefault();
        options.onError(error);
      }
    };
    const paste = (event: ClipboardEvent) => {
      if (!allowed(event, "paste") || !event.clipboardData) return;
      const text = event.clipboardData.getData("text/plain");
      if (!isMusArtClipboardText(text)) return;
      event.preventDefault();
      try {
        this.insert(text, this.engine.getSnapshot());
      } catch (error) {
        options.onError(error);
      }
    };
    document.addEventListener("pointermove", pointer, { capture: true, passive: true });
    document.addEventListener("copy", copy);
    // The existing text/file adapter is installed earlier during runtime startup.
    // Claim structured documents in capture; that adapter respects defaultPrevented.
    document.addEventListener("paste", paste, true);
    const stopPreference = clipboardPreferences.subscribe(() => {});
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      document.removeEventListener("pointermove", pointer, true);
      document.removeEventListener("copy", copy);
      document.removeEventListener("paste", paste, true);
      stopPreference();
      if (--this.users === 0) {
        this.generation++;
        this.pointer = null;
      }
    };
  }
}
const controllers = new WeakMap<EnginePort, ClipboardController>();
export function createClipboardController(engine: EnginePort): ClipboardController {
  let controller = controllers.get(engine);
  if (!controller) {
    controller = new ClipboardController(engine);
    controllers.set(engine, controller);
  }
  return controller;
}
