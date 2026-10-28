import { EFFECT_CATALOG, type SessionSnapshot } from "@musart/core";
import { layerSelection } from "../../layers/menu/selection";
import { SEARCH_CATEGORIES, type SearchItem, type SearchTranslate } from "./model";

import { createDocumentSearchItems } from "./document-items";
import { ACTIONS } from "./definitions";
import { keybindings } from "../../../state/keybindings/store";
import { chordTokens } from "../../../state/keybindings/chords";
import type { BindingSnapshot, CommandId } from "../../../state/keybindings/model";

export const SEARCH_COMMAND_IDS: readonly string[] = Object.freeze([
  ...ACTIONS.map((item) => `action:${item.action}`),
  ...Object.keys(EFFECT_CATALOG).map((type) => `effect:${type}`),
]);

/** Stable commands can be pinned without enumerating project pages or layers. */
export function createSearchCommandItems(
  snapshot: SessionSnapshot,
  t: SearchTranslate,
  bindings: BindingSnapshot = keybindings.readSnapshot(),
): SearchItem[] {
  const shortcut = (id: CommandId) => {
    const chord = bindings.bindings.get(id)?.[0];
    return chord ? chordTokens(chord) : undefined;
  };
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const { selected, editable, hasGroup } = layerSelection(page, snapshot.selection);
  const disabled = {
    selection: selected.length ? undefined : t("search:noSelection"),
    editable: editable ? undefined : t("search:noSelection"),
    group: editable && selected.length > 1 ? undefined : t("search:groupSelection"),
    ungroup: editable && hasGroup ? undefined : t("search:ungroupSelection"),
    undo: snapshot.canUndo ? undefined : t("search:noUndo"),
    redo: snapshot.canRedo ? undefined : t("search:noRedo"),
  };
  const actions: SearchItem[] = ACTIONS.map((item) => ({
    id: `action:${item.action}`,
    category: item.category,
    label: t(item.label),
    terms: `${item.terms} ${t(`search:${item.category}`)}`,
    shortcut: shortcut(`action:${item.action}`),
    disabled: item.gate ? disabled[item.gate] : undefined,
    target: { kind: "action", action: item.action },
  }));
  const effects: SearchItem[] = Object.values(EFFECT_CATALOG).map((effect) => ({
    id: `effect:${effect.type}`,
    label: t(effect.nameKey),
    category: effect.category === "effect" ? "effects" : "adjustments",
    terms: `${effect.type} effect effet adjustment correction couleur color`,
    detail: t("search:applyToSelection"),
    disabled: disabled.editable,
    shortcut: shortcut(`effect:${effect.type}`),
    target: { kind: "effect", effect: effect.type },
  }));
  return [...actions, ...effects].sort(
    (a, b) => SEARCH_CATEGORIES.indexOf(a.category) - SEARCH_CATEGORIES.indexOf(b.category),
  );
}

export function createSearchItems(
  snapshot: SessionSnapshot,
  t: SearchTranslate,
  bindings?: BindingSnapshot,
): SearchItem[] {
  const commands = createSearchCommandItems(snapshot, t, bindings);
  const document = createDocumentSearchItems(snapshot.project, t);
  return [...commands, ...document].sort(
    (a, b) => SEARCH_CATEGORIES.indexOf(a.category) - SEARCH_CATEGORIES.indexOf(b.category),
  );
}
