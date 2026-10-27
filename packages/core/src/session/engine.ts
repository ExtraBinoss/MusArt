import { applyCommand, currentPage } from "./commands";
import { EngineError, ensure } from "../errors";
import { createProject } from "../document/factories";
import { reserveProjectIds } from "../document/identity";
import type { Command, EnginePort, Project, SessionSnapshot } from "../document/model";
import { validateProject } from "../document/validation";

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => clone(item)) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clone(child)]),
    ) as T;
  return value;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function collectExplicitIds(value: unknown, occupied: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectExplicitIds(item, occupied);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "id" && typeof child === "string") occupied.add(child);
      else collectExplicitIds(child, occupied);
    }
  }
}
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
export interface EngineOptions {
  now?: () => string;
  historyLimit?: number;
}

/** A renderer-free document session. All edits are validated on an isolated draft. */
export class EditorEngine implements EnginePort {
  private snapshot: SessionSnapshot;
  private listeners = new Set<() => void>();
  private past: SessionSnapshot[] = [];
  private future: SessionSnapshot[] = [];
  private sequence = 0;
  private historyLimit: number;
  private now: (() => string) | undefined;

  constructor(project: Project = createProject(), options: EngineOptions = {}) {
    validateProject(project);
    this.historyLimit = options.historyLimit ?? 100;
    ensure(
      Number.isInteger(this.historyLimit) && this.historyLimit >= 1 && this.historyLimit <= 100,
      "INVALID_COMMAND",
      "Historique limité entre 1 et 100",
    );
    this.now = options.now;
    reserveProjectIds(project);
    this.snapshot = freeze({
      project: clone(project),
      pageId: project.pages[0]!.id,
      selection: [],
      revision: 0,
      canUndo: false,
      canRedo: false,
    });
  }
  getSnapshot = (): SessionSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: SessionSnapshot): void {
    this.snapshot = freeze(next);
    for (const listener of this.listeners) listener();
  }
  select = (ids: string[]): void => {
    const page = currentPage(this.snapshot.project, this.snapshot.pageId);
    const selection = [...new Set(ids)];
    ensure(
      selection.every((id) => page.layers.some((layer) => layer.id === id)),
      "NOT_FOUND",
      "Sélection contenant un calque introuvable",
    );
    if (sameIds(selection, this.snapshot.selection)) return;
    this.publish({ ...this.snapshot, selection });
  };
  setPage = (id: string): void => {
    currentPage(this.snapshot.project, id);
    if (id === this.snapshot.pageId) return;
    this.publish({ ...this.snapshot, pageId: id, selection: [] });
  };
  execute = (command: Command): void => {
    this.transaction([command]);
  };
  transaction = (commands: Command[]): void => {
    ensure(
      Array.isArray(commands) && commands.length <= 1000,
      "INVALID_COMMAND",
      "Transaction invalide ou trop longue",
    );
    if (commands.length === 0) return;
    const before = this.snapshot;
    const project = clone(before.project);
    let pageId = before.pageId;
    let selection = before.selection;
    let sequence = this.sequence;
    const occupied = new Set<string>([project.id, ...Object.keys(project.assets)]);
    for (const page of project.pages) {
      occupied.add(page.id);
      for (const layer of page.layers) {
        occupied.add(layer.id);
        for (const effect of layer.effects) occupied.add(effect.id);
      }
      for (const guide of page.guides) occupied.add(guide.id);
    }
    const nextId = (prefix: string): string => {
      let id: string;
      do {
        sequence += 1;
        id = `${prefix}-${sequence.toString(36)}`;
      } while (occupied.has(id));
      occupied.add(id);
      return id;
    };
    try {
      // Reserve explicit IDs from the entire batch before generating any IDs.
      collectExplicitIds(commands, occupied);
      for (const command of clone(commands)) {
        const result = applyCommand(project, pageId, command, nextId);
        pageId = result.pageId;
        if (result.selection) selection = result.selection;
      }
      if (this.now) project.updatedAt = this.now();
      validateProject(project);
    } catch (error) {
      if (error instanceof EngineError) throw error;
      throw new EngineError(
        "INVALID_COMMAND",
        error instanceof Error ? error.message : "Commande invalide",
      );
    }
    const page = currentPage(project, pageId);
    selection = selection.filter((id) => page.layers.some((layer) => layer.id === id));
    this.past.push(before);
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    this.sequence = sequence;
    reserveProjectIds(project);
    this.publish({
      project,
      pageId,
      selection,
      revision: before.revision + 1,
      canUndo: true,
      canRedo: false,
    });
  };
  undo = (): void => {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.snapshot);
    this.publish({
      ...previous,
      revision: this.snapshot.revision + 1,
      canUndo: this.past.length > 0,
      canRedo: true,
    });
  };
  redo = (): void => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot);
    this.publish({
      ...next,
      revision: this.snapshot.revision + 1,
      canUndo: true,
      canRedo: this.future.length > 0,
    });
  };
  load = (project: Project): void => {
    validateProject(project);
    reserveProjectIds(project);
    const copy = clone(project);
    this.past = [];
    this.future = [];
    this.sequence = 0;
    this.publish({
      project: copy,
      pageId: copy.pages[0]!.id,
      selection: [],
      revision: this.snapshot.revision + 1,
      canUndo: false,
      canRedo: false,
    });
  };
}
