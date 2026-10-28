import {
  diffReplayState,
  isCommandType,
  type ReplayState,
  type ReplayEvent,
  type ReplayCommandSummary,
} from "@musart/core";
import type { IDBPDatabase } from "idb";
import { openStudioDatabase, type StudioDatabase } from "../../projects/database";
import { HistoryStore } from "../../history/store";
import { StaleHistoryOperationError } from "../../history/operations";
import type { JournalAction, JournalFrame, JournalResult } from "./model";
import { projectForJournal, snapshotJournalFrame } from "./worker-frame";

/** Metadata diffs, hashes, accounting and IndexedDB writes stay on this owned worker boundary. */
export class JournalProcessor {
  private database: Promise<IDBPDatabase<StudioDatabase>> | null = null;
  private readonly store: HistoryStore;
  private mirror: { state: ReplayState; epoch: string; ownNext: number } | null = null;
  private closed = false;
  private closing: Promise<void> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly name: string) {
    if (!name || name.length > 256) throw Error("Invalid journal database name.");
    this.store = new HistoryStore(() => this.open());
  }
  private open() {
    if (this.closed) throw Error("Journal processor is disposed.");
    return (this.database ??= openStudioDatabase(this.name));
  }
  run(action: JournalAction, input: JournalFrame): Promise<JournalResult> {
    if (this.closed || this.closing) return Promise.reject(Error("Journal processor is disposed."));
    let frame: JournalFrame;
    try {
      frame = snapshotJournalFrame(input);
    } catch (error) {
      this.mirror = null;
      return Promise.reject(error);
    }
    const result = this.tail
      .then(() => this.process(action, frame))
      .catch((error: unknown) => {
        this.mirror = null;
        throw error;
      });
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async process(action: JournalAction, frame: JournalFrame): Promise<JournalResult> {
    const id = frame.state.id;
    if (action.kind === "commit") {
      if (
        !Number.isFinite(action.at) ||
        action.at < 0 ||
        !Number.isFinite(action.elapsed) ||
        action.elapsed < 0 ||
        !Array.isArray(action.types) ||
        action.types.length > 1000 ||
        action.types.some((type) => !isCommandType(type)) ||
        !["commit", "undo", "redo", "load"].includes(action.eventKind) ||
        typeof action.checkpoint !== "boolean"
      )
        throw Error("Invalid journal commit.");
      const checkpoint =
        action.checkpoint ||
        this.mirror?.state.id !== id ||
        this.mirror.epoch !== action.operation.epoch ||
        this.mirror.ownNext !== action.operation.expectedNext;
      const knownAssets = new Set(this.mirror?.state.id === id ? this.mirror.state.assetIds : []);
      const assets =
        frame.state.assetIds.some((assetId) => !knownAssets.has(assetId)) ||
        this.mirror?.state.id !== id
          ? (await projectForJournal(await this.open(), frame)).assets
          : Object.fromEntries(frame.assets.map((asset) => [asset.id, asset]));
      const commands = action.types
        .filter(
          (type): type is ReplayCommandSummary["type"] =>
            isCommandType(type) && type !== "setReplay",
        )
        .map((type): ReplayCommandSummary => ({ type, summary: true }));
      const event: ReplayEvent = {
        projectId: id,
        pageId: frame.pageId,
        at: action.at,
        kind: action.eventKind,
        commands,
        delta: checkpoint ? [] : diffReplayState(this.mirror!.state, frame.state),
        ...(checkpoint ? { after: frame.state } : {}),
      };
      const result = await this.store.appendOperation(
        id,
        event,
        assets,
        frame.state.updatedAt,
        action.elapsed,
        { expectedNext: action.operation.expectedNext, current: frame.state },
        action.operation,
      );
      this.mirror = { state: frame.state, epoch: result.meta.epoch!, ownNext: result.ownNext };
      return { meta: result.meta, ownNext: result.ownNext };
    }
    if (action.kind === "configure") {
      if (!Number.isSafeInteger(action.ownNext) || action.ownNext < 0)
        throw Error("Invalid journal cursor.");
      const before = await this.store.info(id);
      await this.store.configure(id, action.options, action.operation);
      const meta = (await this.store.info(id))!;
      if (!meta || meta.configurationId !== action.operation.id)
        throw new StaleHistoryOperationError();
      if (action.options.enabled === true && meta.epoch === action.operation.id) {
        const operation = {
          id: action.operation.id,
          epoch: meta.epoch!,
          expectedNext: action.ownNext,
          retry: before?.configurationId === action.operation.id,
        };
        const project = await projectForJournal(await this.open(), frame);
        const event: ReplayEvent = {
          projectId: id,
          pageId: frame.pageId,
          at: 0,
          kind: "load",
          commands: [],
          delta: [],
          after: frame.state,
        };
        const result = await this.store.appendOperation(
          id,
          event,
          project.assets,
          frame.state.updatedAt,
          1,
          { expectedNext: operation.expectedNext, current: frame.state },
          operation,
        );
        this.mirror = { state: frame.state, epoch: result.meta.epoch!, ownNext: result.ownNext };
        return { meta: result.meta, ownNext: result.ownNext };
      }
      // Preference changes persist no document state. A failed or foreign baseline
      // must stay invalid until a real checkpoint reconciles it.
      this.mirror =
        this.mirror?.state.id === id &&
        this.mirror.ownNext === action.ownNext &&
        this.mirror.epoch === action.operation.epoch
          ? { ...this.mirror, epoch: meta.epoch! }
          : null;
      return { meta, ownNext: action.ownNext };
    }
    if (action.kind !== "ensure" && action.kind !== "clear") throw Error("Unknown journal action.");
    const project = await projectForJournal(await this.open(), frame);
    const meta =
      action.kind === "ensure"
        ? await this.store.ensure(project, frame.pageId)
        : await this.store.clear(project, frame.pageId, action.operation);
    const ownNext = action.kind === "clear" ? 0 : meta.next;
    this.mirror = { state: frame.state, epoch: meta.epoch!, ownNext };
    return { meta, ownNext };
  }
  dispose(): Promise<void> {
    return (this.closing ??= (async () => {
      await this.tail;
      this.closed = true;
      const db = await this.database?.catch(() => undefined);
      db?.close();
      this.mirror = null;
      this.database = null;
    })());
  }
}
