import type { IDBPDatabase } from "idb";
import {
  stateFromProject,
  validateProject,
  type Asset,
  type Project,
  type ReplayEvent,
  type ReplaySpec,
  type ReplayState,
} from "@musart/core";
import type { StudioDatabase } from "../projects/database";
import {
  DEFAULT_HISTORY_LIMIT,
  HISTORY_PAGE_SIZE,
  MAX_HISTORY_LIMIT,
  MIN_HISTORY_LIMIT,
  type HistoryMetadata,
  type HistoryPage,
} from "./model";

import { pruneHistory } from "./retention";
import { HISTORY_STORES } from "./stores";
import { fingerprintState } from "./fingerprint";
import { logicalBytes } from "../projects/logical-bytes";
import { historyUsage } from "./accounting";
import { appendInTransaction } from "./append";
import { initializeHistory } from "./initialization";
import { writeHistory } from "./transactions";
import { assertProjectWritable } from "../projects/lifecycle";
import {
  appendOperationInTransaction,
  assertHistoryControlOperation,
  StaleHistoryOperationError,
  type HistoryOperation,
  type HistoryControlOperation,
} from "./operations";
export class HistoryStore {
  constructor(
    private readonly database: () => Promise<IDBPDatabase<StudioDatabase>>,
    private readonly fingerprint = fingerprintState,
  ) {}
  databaseName = async (): Promise<string> => (await this.database()).name;
  async appendOperation(
    projectId: string,
    event: ReplayEvent,
    assets: Record<string, Asset>,
    stamp: string,
    elapsed: number,
    concurrency: { expectedNext: number; current: ReplayState },
    operation: HistoryOperation,
  ) {
    const fingerprint = await this.fingerprint(concurrency.current);
    return writeHistory(await this.database(), (tx) =>
      appendOperationInTransaction(
        tx,
        { projectId, event, assets, stamp, elapsed, concurrency, fingerprint },
        operation,
      ),
    );
  }
  async info(projectId: string) {
    return (await this.database()).get("journalMeta", projectId);
  }
  async ensure(project: Project, pageId: string): Promise<HistoryMetadata> {
    const fingerprint = await this.fingerprint(stateFromProject(project));
    const db = await this.database();
    const meta = await writeHistory(db, (tx) =>
      initializeHistory(tx, project, pageId, fingerprint),
    );
    // Reconcile a restored/externally replaced manifest using one checkpoint, without loading old events.
    if (meta.lastFingerprint !== fingerprint) {
      await this.append(
        project.id,
        {
          projectId: project.id,
          kind: "load",
          at: 0,
          pageId,
          commands: [],
          delta: [],
          after: stateFromProject(project),
        },
        project.assets,
        project.updatedAt,
        1,
      );
      return (await this.info(project.id))!;
    }
    return meta;
  }
  async append(
    projectId: string,
    event: ReplayEvent,
    assets: Record<string, Asset>,
    stamp: string,
    elapsed = 1,
    concurrency?: { expectedNext: number; current: ReplayState },
  ) {
    const current = concurrency?.current ?? event.after;
    const fingerprint = current ? await this.fingerprint(current) : undefined;
    const db = await this.database();
    return writeHistory(db, (tx) =>
      appendInTransaction(tx, {
        projectId,
        event,
        assets,
        stamp,
        elapsed,
        ...(concurrency ? { concurrency } : {}),
        ...(fingerprint ? { fingerprint } : {}),
      }),
    );
  }

  async usage(projectId: string) {
    return historyUsage(await this.database(), projectId);
  }
  /** Reset atomically to the current project while preserving the user's retention preferences. */
  async clear(
    project: Project,
    pageId: string,
    operation?: HistoryControlOperation,
  ): Promise<HistoryMetadata> {
    if (operation) assertHistoryControlOperation(operation);
    validateProject(project);
    if (!project.pages.some((page) => page.id === pageId))
      throw new Error("History page is missing.");
    const current = stateFromProject(project),
      fingerprint = await this.fingerprint(current);
    return writeHistory(await this.database(), async (tx) => {
      await assertProjectWritable(tx.objectStore("preferences"), project.id);
      const previous = await tx.objectStore("journalMeta").get(project.id);
      if (operation) {
        if (previous?.epoch === operation.id) return previous;
        if (previous?.epoch !== operation.epoch) throw new StaleHistoryOperationError();
      }
      await tx
        .objectStore("journalEvents")
        .delete(IDBKeyRange.bound([project.id, 0], [project.id, Number.MAX_SAFE_INTEGER]));
      for (const key of await tx
        .objectStore("journalAssets")
        .index("by-project")
        .getAllKeys(project.id))
        await tx.objectStore("journalAssets").delete(key);
      const base = { projectId: project.id, pageId, state: current, at: 0 };
      const meta: HistoryMetadata = {
        version: 1,
        epoch: operation?.id ?? crypto.randomUUID(),
        ...(previous?.configurationId ? { configurationId: previous.configurationId } : {}),
        projectId: project.id,
        first: 0,
        next: 0,
        count: 0,
        limit: previous?.limit ?? DEFAULT_HISTORY_LIMIT,
        enabled: previous?.enabled ?? true,
        lastAt: 0,
        lastStamp: project.updatedAt,
        lastFingerprint: fingerprint,
        bytes: { events: 0, assets: 0, base: logicalBytes(base) },
        eventBytesWritten: 0,
        eventBytesPruned: 0,
      };
      await tx.objectStore("journalBase").put(base);
      for (const asset of Object.values(project.assets)) {
        const record = { projectId: project.id, assetId: asset.id, asset };
        meta.bytes!.assets += logicalBytes(record);
        await tx.objectStore("journalAssets").put(record);
      }
      await tx.objectStore("journalMeta").put(meta);
      return meta;
    });
  }
  async page(projectId: string, before?: number, limit = HISTORY_PAGE_SIZE): Promise<HistoryPage> {
    if (!Number.isFinite(limit) || (before !== undefined && !Number.isSafeInteger(before)))
      throw new Error("Invalid history pagination.");
    const db = await this.database();
    const tx = db.transaction(["journalMeta", "journalEvents"], "readonly");
    const meta = await tx.objectStore("journalMeta").get(projectId);
    if (!meta || !meta.count) return { entries: [], before: null, total: 0 };
    const upper = Math.min(meta.next - 1, before === undefined ? meta.next - 1 : before - 1);
    if (upper < meta.first) return { entries: [], before: null, total: meta.count };
    const bound = Math.max(1, Math.min(HISTORY_PAGE_SIZE, Math.floor(limit)));
    const entries = [];
    let cursor = await tx
      .objectStore("journalEvents")
      .openCursor(IDBKeyRange.bound([projectId, meta.first], [projectId, upper]), "prev");
    while (cursor && entries.length < bound) {
      entries.push(cursor.value);
      cursor = await cursor.continue();
    }
    await tx.done;
    const oldest = entries.at(-1)?.sequence;
    return {
      entries,
      before: oldest !== undefined && oldest > meta.first ? oldest : null,
      total: meta.count,
    };
  }
  async replay(projectId: string, signal?: AbortSignal): Promise<ReplaySpec> {
    const db = await this.database();
    const tx = db.transaction(HISTORY_STORES, "readonly");
    const done = tx.done;
    try {
      signal?.throwIfAborted();
      const meta = await tx.objectStore("journalMeta").get(projectId),
        base = await tx.objectStore("journalBase").get(projectId);
      if (!meta || !base) throw new Error("History is not initialized.");
      const originals = await tx.objectStore("journalAssets").index("by-project").getAll(projectId);
      const assets = Object.fromEntries(originals.map(({ asset }) => [asset.id, asset]));
      const { assetIds, ...state } = base.state;
      const initialAssets = Object.fromEntries(
        assetIds.map((id) => {
          if (!assets[id]) throw new Error(`Missing history asset: ${id}`);
          return [id, assets[id]];
        }),
      );
      const events: ReplayEvent[] = [];
      let next = meta.first;
      while (next < meta.next) {
        signal?.throwIfAborted();
        const batch = await tx
          .objectStore("journalEvents")
          .getAll(
            IDBKeyRange.bound([projectId, next], [projectId, meta.next - 1]),
            HISTORY_PAGE_SIZE,
          );
        if (!batch.length || batch[0]!.sequence !== next)
          throw new Error("History entries are incomplete.");
        for (const { sequence, event } of batch) {
          if (sequence !== next++) throw new Error("History entries are incomplete.");
          events.push({ ...event, at: event.at - base.at });
        }
      }
      if (events.length !== meta.count) throw new Error("History count is inconsistent.");
      await done;
      return {
        version: 1,
        initial: { ...state, assets: initialAssets },
        pageId: base.pageId,
        assets: Object.fromEntries(Object.entries(assets).filter(([id]) => !initialAssets[id])),
        events,
        duration: Math.max(1, meta.lastAt - base.at),
      };
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
  }
  async configure(
    projectId: string,
    options: { limit?: number; enabled?: boolean },
    operation?: HistoryControlOperation,
  ) {
    if (operation) assertHistoryControlOperation(operation);
    if (options.enabled !== undefined && typeof options.enabled !== "boolean")
      throw new TypeError("History enabled must be a boolean.");
    if (
      options.limit !== undefined &&
      (!Number.isSafeInteger(options.limit) ||
        options.limit < MIN_HISTORY_LIMIT ||
        options.limit > MAX_HISTORY_LIMIT)
    )
      throw new Error(
        `History limit must be between ${MIN_HISTORY_LIMIT} and ${MAX_HISTORY_LIMIT}.`,
      );
    const db = await this.database();
    return writeHistory(db, async (tx) => {
      await assertProjectWritable(tx.objectStore("preferences"), projectId);
      const meta = await tx.objectStore("journalMeta").get(projectId);
      if (!meta) throw new Error("History is not initialized.");
      if (operation) {
        if (
          meta.configurationId === operation.id &&
          (meta.epoch === operation.epoch || meta.epoch === operation.id)
        )
          return;
        if (meta.epoch !== operation.epoch || meta.configurationId !== operation.configurationId)
          throw new StaleHistoryOperationError();
      }
      if (options.limit !== undefined) meta.limit = options.limit;
      if (options.enabled !== undefined && options.enabled !== meta.enabled) {
        meta.enabled = options.enabled;
        meta.epoch = operation?.id ?? crypto.randomUUID();
      }
      meta.configurationId = operation?.id ?? crypto.randomUUID();
      await pruneHistory(tx, meta);
      await tx.objectStore("journalMeta").put(meta);
    });
  }
}
