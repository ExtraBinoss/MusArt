import { chordTokens } from "../../state/keybindings/chords";
import { keybindings } from "../../state/keybindings/store";
import type { BindingSnapshot, CommandId } from "../../state/keybindings/model";

export const CANVAS_GESTURES = [
  ["search:pan", ["search:wheel"]],
  ["search:pan", ["search:spaceDrag"]],
  ["search:zoom", ["Mod", "search:wheel"]],
] as const;
export function modifierLabel(platform: string = navigator.platform): string {
  return /mac|iphone|ipad/i.test(platform) ? "⌘" : "Ctrl";
}

export function bindingLabel(
  id: CommandId,
  snapshot: BindingSnapshot = keybindings.readSnapshot(),
): string {
  const chord = snapshot.bindings.get(id)?.[0];
  return chord
    ? chordTokens(chord)
        .map((key) => (key === "Mod" ? modifierLabel() : key))
        .join("+")
    : "";
}
