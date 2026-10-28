import { EFFECT_CATALOG } from "@musart/core";
import { ACTIONS } from "../../components/search/catalog/definitions";
import type { SearchCategory } from "../../components/search/catalog/model";
import type { CommandId, KeyChord, NudgeDirection } from "./model";

export interface BindingCommand {
  readonly id: CommandId;
  readonly label: string;
  readonly category: SearchCategory;
  readonly defaults: readonly KeyChord[];
}
const key = (key: string, mod = false, shift = false, alt = false): KeyChord => ({
  key,
  mod,
  shift,
  alt,
});
const extraDefaults: Partial<Record<CommandId, readonly KeyChord[]>> = {
  "action:redo": [key("z", true, true), key("y", true)],
  "action:delete": [key("Backspace"), key("Delete")],
  "action:exportImage": [key("e", true, true)],
  "action:importImages": [key("o", true, true)],
  "action:openPortable": [key("o", true)],
  "action:newProject": [key("n", true)],
  "action:fit": [key("0", true)],
  "action:reset": [key("1", true)],
  "action:zoomIn": [key("+", true), key("=", true)],
  "action:zoomOut": [key("-", true)],
  "action:rulers": [key("r", true)],
  "action:shortcuts": [key("?")],
};
const directions: readonly NudgeDirection[] = ["Left", "Right", "Up", "Down"];
export const BINDING_COMMANDS: readonly BindingCommand[] = Object.freeze([
  ...ACTIONS.map((action): BindingCommand => {
    const id = `action:${action.action}` as const;
    const tokens = action.shortcut;
    const last = tokens?.at(-1);
    const normalized = last === "⌫" ? "Backspace" : last === "Esc" ? "Escape" : last?.toLowerCase();
    return {
      id,
      label: action.label,
      category: action.category,
      defaults:
        extraDefaults[id] ??
        (normalized ? [key(normalized, tokens!.includes("Mod"), tokens!.includes("Shift"))] : []),
    };
  }),
  ...Object.values(EFFECT_CATALOG).map((effect): BindingCommand => ({
    id: `effect:${effect.type}`,
    label: effect.nameKey,
    category: effect.category === "effect" ? "effects" : "adjustments",
    defaults: [],
  })),
  { id: "app:search", label: "search:title", category: "help", defaults: [key("k", true)] },
  ...directions.flatMap((direction): BindingCommand[] => [
    {
      id: `nudge:${direction}`,
      label: `keybindings:nudge${direction}`,
      category: "edit",
      defaults: [key(`Arrow${direction}`)],
    },
    {
      id: `nudge:${direction}Large`,
      label: `keybindings:nudge${direction}Large`,
      category: "edit",
      defaults: [key(`Arrow${direction}`, false, true)],
    },
  ]),
]);
const ids = new Set<string>(BINDING_COMMANDS.map((command) => command.id));
export function isCommandId(value: string): value is CommandId {
  return ids.has(value);
}
