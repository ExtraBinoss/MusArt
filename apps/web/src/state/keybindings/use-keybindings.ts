import { useSyncExternalStore } from "react";
import { keybindings } from "./store";

/** One external preference snapshot updates dispatchers, command keycaps and the editor together. */
export function useKeybindings() {
  return useSyncExternalStore(
    keybindings.subscribe,
    keybindings.readSnapshot,
    keybindings.readSnapshot,
  );
}
