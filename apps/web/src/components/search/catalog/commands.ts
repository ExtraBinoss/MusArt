import type { SessionSnapshot } from "@musart/core";
import type { BindingSnapshot } from "../../../state/keybindings/model";
import { layerSelection } from "../../layers/menu/selection";
import { ACTIONS, type ActionDefinition } from "./definitions";
import { createSearchCommandItems } from "./items";
import type { SearchItem, SearchTranslate } from "./model";

const EMPTY_SELECTION: string[] = [];
Object.freeze(EMPTY_SELECTION);
const gates = new Map(ACTIONS.map((action) => [`action:${action.action}`, action.gate]));
type Gate = NonNullable<ActionDefinition["gate"]>;
/** Labels and shortcuts change independently of selection; only availability changes on a click. */
export class SearchCommands {
  private translate: SearchTranslate | null = null;
  private bindings: BindingSnapshot | null = null;
  private locale = "";
  private motionHint = "";
  private base: SearchItem[] = [];
  private readonly states = new Map<string, SearchItem[]>();
  read(
    snapshot: SessionSnapshot,
    t: SearchTranslate,
    bindings: BindingSnapshot,
    locale: string,
  ): SearchItem[] {
    if (this.translate !== t || this.bindings !== bindings || this.locale !== locale) {
      this.motionHint = t("motion:requiresMotion");
      this.base = createSearchCommandItems(
        { ...snapshot, selection: EMPTY_SELECTION, canUndo: false, canRedo: false },
        t,
        bindings,
      );
      this.translate = t;
      this.bindings = bindings;
      this.locale = locale;
      this.states.clear();
    }
    const page =
      snapshot.project.pages.find((page) => page.id === snapshot.pageId) ??
      snapshot.project.pages[0]!;
    const state = layerSelection(page, snapshot.selection);
    const allowed: Record<Gate, boolean> = {
      motion: page.motion?.mode === "motion",
      selection: state.selected.length > 0,
      editable: state.editable,
      group: state.editable && state.selected.length > 1,
      ungroup: state.editable && state.hasGroup,
      undo: snapshot.canUndo,
      redo: snapshot.canRedo,
    };
    const key = JSON.stringify([snapshot.pageId, ...Object.values(allowed)]);
    let rows = this.states.get(key);
    if (!rows)
      rows = this.base.map((item) => {
        const gate = item.target.kind === "effect" ? "editable" : gates.get(item.id);
        if (gate === "motion")
          return { ...item, disabled: allowed.motion ? undefined : this.motionHint };
        return gate && allowed[gate] ? { ...item, disabled: undefined } : item;
      });
    this.states.delete(key);
    this.states.set(key, rows);
    if (this.states.size > 8) this.states.delete(this.states.keys().next().value!);
    return rows;
  }
}
