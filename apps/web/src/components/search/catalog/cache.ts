import { createLayerGeometryIndex, type Project, type SessionSnapshot } from "@musart/core";
import type { BindingSnapshot } from "../../../state/keybindings/model";
import { createSearchCommandItems } from "./items";
import { createDocumentSearchItems } from "./document-items";
import { prepareSearchItems } from "./search";
import {
  SEARCH_CATEGORIES,
  type SearchCategory,
  type SearchItem,
  type SearchTranslate,
} from "./model";

/** Only the small command gates depend on selection; document rows and search text remain prepared. */
function commandGates(snapshot: SessionSnapshot): string {
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const geometry = createLayerGeometryIndex(page);
  let count = 0,
    editable = true,
    hasGroup = false;
  for (const id of snapshot.selection) {
    const layer = geometry.byId.get(id);
    if (!layer) continue;
    count++;
    if (geometry.isLocked(id)) editable = false;
    if (layer.kind === "group") hasGroup = true;
  }
  return JSON.stringify([
    snapshot.pageId,
    snapshot.canUndo,
    snapshot.canRedo,
    count > 0,
    editable && count > 0,
    count > 1,
    hasGroup,
  ]);
}
/** Geometry, paint and assets do not change document-search labels or ordering. */
function sameDocumentMetadata(before: Project | null, after: Project): boolean {
  if (before === after) return true;
  if (!before || before.id !== after.id || before.pages.length !== after.pages.length) return false;
  for (let pageIndex = 0; pageIndex < after.pages.length; pageIndex++) {
    const oldPage = before.pages[pageIndex]!,
      page = after.pages[pageIndex]!;
    if (
      oldPage.id !== page.id ||
      oldPage.name !== page.name ||
      oldPage.width !== page.width ||
      oldPage.height !== page.height ||
      oldPage.layers.length !== page.layers.length
    )
      return false;
    for (let index = 0; index < page.layers.length; index++) {
      const old = oldPage.layers[index]!,
        layer = page.layers[index]!;
      if (
        old.id !== layer.id ||
        old.name !== layer.name ||
        old.kind !== layer.kind ||
        old.text !== layer.text
      )
        return false;
    }
  }
  return true;
}

interface CatalogState {
  commands: SearchItem[];
  rows?: SearchItem[];
  categories?: Set<SearchCategory>;
}

/** One prepared project index. Ordinary selection changes neither enumerate nor score its document rows. */
export class SearchCatalog {
  private project: Project | null = null;
  private translate: SearchTranslate | null = null;
  private locale = "";
  private bindings: BindingSnapshot | null = null;
  private gates = "";
  private documents = new Map<SearchCategory, SearchItem[]>();
  private states = new Map<string, CatalogState>();
  private commandRows: SearchItem[] = [];
  private itemRows: SearchItem[] = [];
  private categorySet = new Set<SearchCategory>();
  get commands(): readonly SearchItem[] {
    return this.commandRows;
  }
  get categories(): ReadonlySet<SearchCategory> {
    return this.categorySet;
  }
  read(
    snapshot: SessionSnapshot,
    t: SearchTranslate,
    bindings: BindingSnapshot,
    locale: string,
  ): SearchItem[] {
    const translated = this.translate !== t || this.locale !== locale;
    const changed = translated || !sameDocumentMetadata(this.project, snapshot.project);
    if (translated || this.bindings !== bindings) this.states.clear();
    this.project = snapshot.project;
    this.translate = t;
    this.locale = locale;
    if (changed) {
      // Joined arrays contain document rows; command metadata itself has no document captures.
      for (const state of this.states.values()) {
        state.rows = undefined;
        state.categories = undefined;
      }
      this.documents = new Map();
      const documents = createDocumentSearchItems(snapshot.project, t);
      prepareSearchItems(documents);
      for (const item of documents) {
        const group = this.documents.get(item.category) ?? [];
        group.push(item);
        this.documents.set(item.category, group);
      }
    }
    const gates = commandGates(snapshot);
    if (!changed && this.gates === gates && this.bindings === bindings) return this.itemRows;
    this.gates = gates;
    this.bindings = bindings;
    let state = this.states.get(gates);
    if (!state) {
      state = { commands: createSearchCommandItems(snapshot, t, bindings) };
      prepareSearchItems(state.commands);
    }
    // A small LRU retains revisited selection gates without retaining old document revisions.
    this.states.delete(gates);
    this.states.set(gates, state);
    if (this.states.size > 8) this.states.delete(this.states.keys().next().value!);
    this.commandRows = state.commands;
    if (state.rows && state.categories) {
      this.itemRows = state.rows;
      this.categorySet = state.categories;
      return this.itemRows;
    }
    const rows: SearchItem[] = [],
      categories = new Set<SearchCategory>();
    // Registry categories keep their existing order without sorting all document rows again.
    for (const category of SEARCH_CATEGORIES) {
      for (const item of this.commandRows)
        if (item.category === category) {
          rows.push(item);
          categories.add(category);
        }
      for (const item of this.documents.get(category) ?? []) {
        rows.push(item);
        categories.add(category);
      }
    }
    this.itemRows = rows;
    this.categorySet = categories;
    state.rows = rows;
    state.categories = categories;
    return rows;
  }
}
