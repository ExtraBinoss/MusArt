import type { Project, SessionSnapshot } from "@musart/core";
import type { BindingSnapshot } from "../../../state/keybindings/model";
import { SearchCommands } from "./commands";
import { createDocumentSearchItems } from "./document-items";
import { prepareSearchItems } from "./search";
import {
  SEARCH_CATEGORIES,
  type SearchCategory,
  type SearchItem,
  type SearchTranslate,
} from "./model";

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
  rows: SearchItem[];
  categories: Set<SearchCategory>;
}

/** One prepared project index. Ordinary selection changes neither enumerate nor score its document rows. */
export class SearchCatalog {
  private project: WeakRef<Project> | null = null;
  private projectId = "";
  private translate: SearchTranslate | null = null;
  private locale = "";
  private documents = new Map<SearchCategory, SearchItem[]>();
  private readonly availability = new SearchCommands();
  private states = new WeakMap<SearchItem[], CatalogState>();
  private commandRows: SearchItem[] = [];
  private itemRows: SearchItem[] = [];
  private categorySet = new Set<SearchCategory>();
  get commands(): readonly SearchItem[] {
    return this.commandRows;
  }
  get categories(): ReadonlySet<SearchCategory> {
    return this.categorySet;
  }
  /** The closed dock needs availability, without document indexing, sorting or normalization. */
  commandsFor(
    snapshot: SessionSnapshot,
    t: SearchTranslate,
    bindings: BindingSnapshot,
    locale: string,
  ): SearchItem[] {
    if (this.projectId !== snapshot.project.id) {
      this.projectId = snapshot.project.id;
      this.project = null;
      this.documents.clear();
      this.states = new WeakMap();
      this.itemRows = [];
      this.categorySet = new Set();
    }
    this.commandRows = this.availability.read(snapshot, t, bindings, locale);
    return this.commandRows;
  }
  read(
    snapshot: SessionSnapshot,
    t: SearchTranslate,
    bindings: BindingSnapshot,
    locale: string,
  ): SearchItem[] {
    const commands = this.commandsFor(snapshot, t, bindings, locale);
    const translated = this.translate !== t || this.locale !== locale;
    const changed =
      translated || !sameDocumentMetadata(this.project?.deref() ?? null, snapshot.project);
    this.project = new WeakRef(snapshot.project);
    this.translate = t;
    this.locale = locale;
    if (changed) {
      // Joined arrays contain document rows; command metadata itself has no document captures.
      this.states = new WeakMap();
      this.documents = new Map();
      const documents = createDocumentSearchItems(snapshot.project, t);
      prepareSearchItems(documents);
      for (const item of documents) {
        const group = this.documents.get(item.category) ?? [];
        group.push(item);
        this.documents.set(item.category, group);
      }
    }
    prepareSearchItems(commands);
    const state = this.states.get(commands);
    if (state) {
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
    this.states.set(commands, { rows, categories });
    return rows;
  }
}
