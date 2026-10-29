import { applyCommand, currentPage } from "./commands";
import { EngineError, ensure } from "../errors";
import { createProject } from "../document/factories";
import { reserveProjectIds } from "../document/identity";
import type { Command, EnginePort, Project, SessionSnapshot } from "../document/model";
import { validateProject } from "../document/validation";
import { cloneValue as clone, freezeValue as freeze } from "../document/immutable";
import { markPublishedProject } from "../document/published";
import type { CommandCommit, CommandCommitInfo } from "../animation/model";
import { createLayerGeometryIndex } from "../layers/geometry-index";
import { createCommandDraft } from "./drafts";

function collectExplicitIds(value: unknown, occupied: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectExplicitIds(item, occupied);
  } else if (value !== null && typeof value === "object") {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      const child = (value as Record<string, unknown>)[key];
      if (key === "id" && typeof child === "string") occupied.add(child);
      else if (child !== null && typeof child === "object") collectExplicitIds(child, occupied);
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
interface CommitEnvelope {
  info: CommandCommitInfo;
  detailed?: CommandCommit;
}

/** A renderer-free document session. All edits are validated on an isolated draft. */
export class EditorEngine implements EnginePort {
  private snapshot: SessionSnapshot;
  private listeners = new Set<() => void>();
  private commandListeners = new Set<(event: CommandCommit) => void>();
  private commitInfoListeners = new Set<(event: CommandCommitInfo) => void>();
  private readonly commits: CommitEnvelope[] = [];
  private publications = 0;
  private drainingCommits = false;
  private past: SessionSnapshot[] = [];
  private future: SessionSnapshot[] = [];
  private sequence = 0;
  private historyLimit: number;
  private now: (() => string) | undefined;

  constructor(project: Project = createProject(), options: EngineOptions = {}) {
    const copy = clone(project);
    validateProject(copy);
    this.historyLimit = options.historyLimit ?? 100;
    ensure(
      Number.isInteger(this.historyLimit) && this.historyLimit >= 1 && this.historyLimit <= 100,
      "INVALID_COMMAND",
      "Historique limité entre 1 et 100",
    );
    this.now = options.now;
    reserveProjectIds(copy);
    this.snapshot = freeze({
      project: copy,
      pageId: copy.pages[0]!.id,
      selection: [],
      revision: 0,
      canUndo: false,
      canRedo: false,
    });
    markPublishedProject(this.snapshot.project);
  }
  getSnapshot = (): SessionSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeCommands = (listener: (event: CommandCommit) => void): (() => void) => {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  };
  subscribeCommitInfo = (listener: (event: CommandCommitInfo) => void): (() => void) => {
    this.commitInfoListeners.add(listener);
    return () => {
      this.commitInfoListeners.delete(listener);
    };
  };
  private drainCommits(): void {
    if (!this.commits.length || this.publications || this.drainingCommits) return;
    this.drainingCommits = true;
    let cursor = 0,
      failed = false,
      failure: unknown;
    const deliver = <T>(listeners: Set<(event: T) => void>, event: T) => {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
    };
    try {
      while (cursor < this.commits.length) {
        const envelope = this.commits[cursor++]!;
        deliver(this.commitInfoListeners, envelope.info);
        if (envelope.detailed) deliver(this.commandListeners, envelope.detailed);
      }
    } finally {
      this.commits.splice(0, cursor);
      this.drainingCommits = false;
    }
    if (failed) throw failure;
  }
  private publish(
    next: SessionSnapshot,
    kind?: CommandCommit["kind"],
    commands: readonly Command[] = [],
    detailedCommands?: readonly Command[],
  ): void {
    const snapshot = freeze(next);
    markPublishedProject(snapshot.project);
    if (kind) {
      // Capture before state listeners can synchronously publish another transaction.
      const detailed =
        detailedCommands ?? (this.commandListeners.size && !commands.length ? [] : undefined);
      this.commits.push({
        info: freeze({ kind, types: commands.map((command) => command.type), snapshot }),
        ...(detailed ? { detailed: freeze({ kind, commands: detailed, snapshot }) } : {}),
      });
    }
    this.snapshot = snapshot;
    this.publications++;
    let failed = false,
      failure: unknown;
    try {
      for (const listener of this.listeners) listener();
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      this.publications--;
      try {
        this.drainCommits();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
    if (failed) throw failure;
  }
  select = (ids: string[]): void => {
    const page = currentPage(this.snapshot.project, this.snapshot.pageId);
    const selection = [...new Set(ids)];
    const geometry = createLayerGeometryIndex(page);
    ensure(
      selection.every((id) => geometry.byId.has(id)),
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
    let project: Project;
    let pageId = before.pageId;
    let selection = before.selection;
    let sequence = this.sequence;
    let detailedCommands: readonly Command[] | undefined;
    const occupied = new Set<string>([before.project.id, ...Object.keys(before.project.assets)]);
    for (const page of before.project.pages) {
      occupied.add(page.id);
      for (const track of page.motion?.tracks ?? []) {
        occupied.add(track.id);
        for (const property of track.properties) {
          occupied.add(property.id);
          for (const key of property.keyframes) occupied.add(key.id);
        }
      }
      for (const layer of page.layers) {
        occupied.add(layer.id);
        for (const effect of layer.effects) occupied.add(effect.id);
        for (const guide of layer.guides ?? []) occupied.add(guide.id);
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
      project = createCommandDraft(before.project, before.pageId, commands);
      // Reserve explicit IDs from the entire batch before generating any IDs.
      collectExplicitIds(commands, occupied);
      if (this.commandListeners.size) detailedCommands = freeze(clone(commands));
      for (const command of clone(commands)) {
        const result = applyCommand(project, pageId, command, nextId, before.revision);
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
    const remainingIds = new Set(page.layers.map((layer) => layer.id));
    selection = selection.filter((id) => remainingIds.has(id));
    this.past.push(before);
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    this.sequence = sequence;
    reserveProjectIds(project);
    this.publish(
      {
        project,
        pageId,
        selection,
        revision: before.revision + 1,
        canUndo: true,
        canRedo: false,
      },
      "commit",
      commands,
      detailedCommands,
    );
  };
  undo = (): void => {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.snapshot);
    this.publish(
      {
        ...previous,
        revision: this.snapshot.revision + 1,
        canUndo: this.past.length > 0,
        canRedo: true,
      },
      "undo",
    );
  };
  redo = (): void => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot);
    this.publish(
      {
        ...next,
        revision: this.snapshot.revision + 1,
        canUndo: true,
        canRedo: this.future.length > 0,
      },
      "redo",
    );
  };
  load = (project: Project): void => {
    const copy = clone(project);
    validateProject(copy);
    reserveProjectIds(copy);
    this.past = [];
    this.future = [];
    this.sequence = 0;
    this.publish(
      {
        project: copy,
        pageId: copy.pages[0]!.id,
        selection: [],
        revision: this.snapshot.revision + 1,
        canUndo: false,
        canRedo: false,
      },
      "load",
    );
  };
}
