import { useEffect } from "react";
import { matchBinding } from "../../state/keybindings/matching";
import { keybindings } from "../../state/keybindings/store";

export function useSearchShortcuts(onToggle: () => void, onShortcuts: () => void) {
  useEffect(() => {
    const stopPreferences = keybindings.subscribe(() => {});
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-keybinding-capture]")) return;
      const command = matchBinding(event, keybindings.readSnapshot());
      if (command !== "app:search" && command !== "action:shortcuts") return;
      const focus = target instanceof HTMLElement ? target : document.activeElement;
      const modal =
        focus?.closest('[role="dialog"],[role="alertdialog"]') ??
        [
          ...document.querySelectorAll(
            '[role="dialog"]:not([data-state="closed"]),[role="alertdialog"]:not([data-state="closed"])',
          ),
        ].at(-1);
      const searchModal = modal?.hasAttribute("data-magic-search");
      if (command === "app:search" && (!modal || searchModal)) {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
        return;
      }
      if (command !== "action:shortcuts" || modal) return;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input,textarea,select,[role="combobox"],[role="spinbutton"]'))
      )
        return;
      event.preventDefault();
      onShortcuts();
    }
    // Capture reserves the app shortcut before cmdk's optional Ctrl+K list navigation.
    document.addEventListener("keydown", onKey, true);
    return () => {
      stopPreferences();
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onToggle, onShortcuts]);
}
