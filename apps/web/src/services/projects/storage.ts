import type { IDBPDatabase } from "idb";
import {
  openStudioDatabase,
  type StudioDatabase,
  type StoredThumbnail,
  type ThumbnailInfo,
} from "./database";
import { thumbnailRevisions } from "./thumbnails/revisions";
import { thumbnailRevision } from "./thumbnails/revision";
import { manifestBytes, projectSummary } from "./records";
import { projectUsage, estimateOriginStorage } from "./usage";
import { appendInTransaction } from "../history/append";
import { initializeHistory } from "../history/initialization";
import { CanonicalHasher } from "../serialization/hashing/client";
import type { CanonicalHashJob } from "../serialization/hashing/protocol";
import { HISTORY_WRITE_STORES } from "../history/stores";
import type { HistoryWrite } from "../history/transactions";
import { HistoryStore } from "../history/store";
import { snapshotProject } from "./writes/snapshot";
import { PersistenceClient } from "./persistence/client";
import { validateThumbnail } from "./persistence/thumbnail";
import { prepareProjectWrite, withFullOriginals } from "./persistence/prepare";
import { ThumbnailDigestMemo } from "./thumbnails/digest-memo";
import { THUMBNAIL_RENDER_VERSION } from "./thumbnails/model";
import type { ThumbnailRead } from "./thumbnails/model";
import { refreshThumbnailSchema } from "./persistence/thumbnail-schema";
import {
  readProjectWriteRevision,
  assertProjectWriteRevision,
  renewProjectWriteRevision,
  StaleProjectWriteError,
} from "./writes/revision";
import { isProjectDeleted, retireProject } from "./lifecycle";
import { ProjectPreferencesStore } from "./preferences/store";
import { projectPreferencesKey } from "./preferences/schema";
import {
  validateProject,
  isOriginalMediaAsset,
  sameAssetOriginal,
  type OriginalMediaAsset,
  isPublishedProject,
  EditorEngine,
  diffReplayState,
  stateFromProject,
  type Asset,
  type Composition,
  type EnginePort,
  type Project,
} from "@musart/core";
import type { ProjectSummary } from "../../state/contracts";
import type {
  PreparedProjectSave,
  PreparedProjectWrite,
  SaveProjectOptions,
} from "./writes/prepared";
import type { MediaOriginalInput } from "./media/model";
import { readProjectPreview } from "./previews/read";
import { readMediaOriginal } from "./media/read";

/** Original bytes are persisted independently from small, frequently changing manifests. */
export class ProjectStore {
  private connection: Promise<IDBPDatabase<StudioDatabase>> | undefined;
  // Only the most recently opened/saved project's originals are retained for write comparison.
  private activeAssets:
    | { projectId: string; revision: string; urls: Map<string, string> }
    | undefined;
  private readonly observedWrites = new Map<string, string>();
  private observeWrite(id: string, revision: string) {
    this.observedWrites.delete(id);
    this.observedWrites.set(id, revision);
    if (this.observedWrites.size > 128)
      this.observedWrites.delete(this.observedWrites.keys().next().value!);
  }
  private hasher: CanonicalHasher | undefined;
  private persistence: PersistenceClient | undefined;
  private readonly digestMemo = new ThumbnailDigestMemo();
  private readonly pagePayloads = new WeakMap<Composition, number>();
  private generation = 0;
  private readonly preparedWrites = new WeakMap<PreparedProjectSave, PreparedProjectWrite>();
  private assertGeneration(generation: number) {
    if (generation !== this.generation)
      throw new DOMException("Project store operation was closed.", "AbortError");
  }
  private hash = (job: CanonicalHashJob, generation = this.generation) => {
    this.assertGeneration(generation);
    return (this.hasher ??= new CanonicalHasher()).hash(job, {
      isCurrent: () => generation === this.generation,
      ...(job.kind === "thumbnail"
        ? { onPageBytes: (bytes: number) => this.pagePayloads.set(job.page, bytes) }
        : {}),
    });
  };
  thumbnailRevision = (page: Composition, assets: Record<string, Asset>) => {
    const generation = this.generation;
    return this.digestMemo.get(page, assets, () =>
      thumbnailRevision(page, assets, (job) => this.hash(job, generation)),
    );
  };
  readonly history = new HistoryStore(
    () => this.db(),
    (state) => this.hash({ kind: "history", state }),
  );
  readonly preferences = new ProjectPreferencesStore(() => this.db());
  constructor(private readonly name = "musart-studio") {}
  private db() {
    this.connection ??= openStudioDatabase(this.name).catch((error) => {
      this.connection = undefined;
      throw error;
    });
    return this.connection;
  }
  async prepareSave(input: Project, thumbnail?: string, options: SaveProjectOptions = {}) {
    const generation = this.generation;
    const project = snapshotProject(input);
    if (!isPublishedProject(project)) validateProject(project);
    const originals = (options.mediaOriginals ?? []).map((original) => ({
      projectId: project.id,
      originalId: original.originalId,
      contentRevision: original.contentRevision,
      blob: original.blob,
    }));
    this.digestMemo.certify(project);
    const basis = this.activeAssets;
    const db = await this.db();
    const reading = db.transaction("preferences");
    const currentRevision = await readProjectWriteRevision(reading.store, project.id);
    await reading.done;
    const expectedRevision = options.expectedRevision ?? currentRevision;
    if (expectedRevision !== currentRevision) throw new StaleProjectWriteError(project.id);
    const pageRevisions = await thumbnailRevisions(
      project.pages,
      project.assets,
      (job) => this.hash(job, generation),
      (page) => {
        this.assertGeneration(generation);
        return this.thumbnailRevision(page, project.assets);
      },
    );
    this.assertGeneration(generation);
    const prepared = prepareProjectWrite(
      project,
      pageRevisions,
      project.pages.map((page) => this.pagePayloads.get(page)),
      { ...options, expectedRevision },
      thumbnail,
      basis,
    );
    const token = Object.freeze({ project });
    this.preparedWrites.set(token, { project, ...prepared, originals, generation });
    return token;
  }
  /** Only native transactional I/O remains here; hashing and confirmation happen before locking. */
  async persistPrepared(token: PreparedProjectSave): Promise<void> {
    const prepared = this.preparedWrites.get(token);
    if (!prepared) throw Error("Unknown or already consumed prepared project write.");
    this.preparedWrites.delete(token);
    const { project, generation, originals } = prepared;
    this.assertGeneration(generation);
    const persistence = (this.persistence ??= new PersistenceClient(this.name, () => this.db()));
    let result;
    try {
      result = await persistence.save(prepared.frame, originals);
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "ASSET_BASIS_MISMATCH"
      )
        throw error;
      // This transaction wrote nothing. Keep the same captured document revision;
      // a concurrent writer still fails CAS when the complete originals are retried.
      this.assertGeneration(generation);
      result = await persistence.save(withFullOriginals(prepared.frame, project), originals);
    }
    // Closing drains already-admitted writes, but their results cannot repopulate
    // caches or loaded baselines belonging to a closed/reopened generation.
    if (generation === this.generation) {
      this.activeAssets = {
        projectId: project.id,
        revision: result.assetsRevision,
        urls: prepared.urls,
      };
      this.observeWrite(project.id, result.writeRevision);
    }
  }
  async save(input: Project, thumbnail?: string, options: SaveProjectOptions = {}): Promise<void> {
    await this.persistPrepared(await this.prepareSave(input, thumbnail, options));
  }
  prepareSaveCurrent(
    project: Project,
    options: { mediaOriginals?: readonly MediaOriginalInput[] } = {},
  ) {
    const expected = this.observedWrites.get(project.id);
    return this.prepareSave(project, undefined, {
      ...options,
      expectedRevision: expected ?? "",
      requireAbsent: expected === undefined,
    });
  }
  /** Editor writes retain their loaded baseline; unknown existing projects must be reopened. */
  async saveCurrent(
    project: Project,
    options: { mediaOriginals?: readonly MediaOriginalInput[] } = {},
  ): Promise<void> {
    await this.persistPrepared(await this.prepareSaveCurrent(project, options));
  }
  async loadMediaOriginal(
    projectId: string,
    asset: OriginalMediaAsset,
    options: { signal?: AbortSignal } = {},
  ): Promise<Blob> {
    const generation = this.generation;
    const blob = await readMediaOriginal(await this.db(), projectId, asset, options.signal);
    this.assertGeneration(generation);
    return blob;
  }
  async loadPreview(id: string, options: { signal?: AbortSignal } = {}): Promise<Project> {
    const generation = this.generation;
    const project = await readProjectPreview(await this.db(), id, options.signal);
    this.assertGeneration(generation);
    return project;
  }
  async load(
    id: string,
    options: { observe?: boolean; remember?: boolean } = {},
  ): Promise<Project> {
    const generation = this.generation;
    const db = await this.db();
    const stores = ["projects", "assets", "preferences"] as const;
    const tx = options.remember
      ? db.transaction(stores, "readwrite")
      : db.transaction(stores, "readonly");
    const record = await tx.objectStore("projects").get(id);
    if (!record) throw new Error("Projet local introuvable.");
    const writeRevision = await readProjectWriteRevision(tx.objectStore("preferences"), id);
    let project: Project;
    if (record.storageVersion === 2) {
      const assets: Record<string, Asset> = {};
      for (const [assetId, metadata] of Object.entries(record.project.assets)) {
        const original =
          metadata.kind === "video" || metadata.kind === "audio"
            ? undefined
            : await tx.objectStore("assets").get([id, assetId]);
        if (metadata.kind !== "video" && metadata.kind !== "audio" && !original)
          throw new Error(`Ressource locale manquante : ${metadata.name}.`);
        Object.defineProperty(assets, assetId, {
          value:
            metadata.kind === "video" || metadata.kind === "audio"
              ? metadata
              : { ...metadata, dataUrl: original!.dataUrl },
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      project = { ...record.project, assets };
    } else project = record.project;
    validateProject(project);
    if (project.id !== id) throw new Error("Identité du projet local incohérente.");
    if (tx.mode === "readwrite") await tx.objectStore("preferences").put(id, "last-project");
    await tx.done;
    this.assertGeneration(generation);
    if (record.thumbnailRenderVersion !== THUMBNAIL_RENDER_VERSION) {
      // Capture the real stored input before exposing a mutable loaded document.
      const captured = snapshotProject(project);
      this.digestMemo.certify(captured);
      const revisions = await thumbnailRevisions(
        captured.pages,
        captured.assets,
        (job) => this.hash(job, generation),
        (page) => this.thumbnailRevision(page, captured.assets),
      );
      this.assertGeneration(generation);
      const refreshed = await refreshThumbnailSchema(
        db,
        {
          id,
          writeRevision,
          rendererVersion: record.thumbnailRenderVersion,
          storageVersion: record.storageVersion,
          assetsRevision: record.storageVersion === 2 ? record.assetsRevision : undefined,
          pageIds: captured.pages.map((page) => page.id),
        },
        revisions,
        () => generation === this.generation,
      );
      this.assertGeneration(generation);
      if (!refreshed) throw new StaleProjectWriteError(id);
    }
    this.activeAssets =
      record.storageVersion === 2 && typeof record.assetsRevision === "string"
        ? {
            projectId: id,
            revision: record.assetsRevision,
            urls: new Map(
              Object.values(project.assets)
                .filter((asset) => !isOriginalMediaAsset(asset))
                .map((asset) => [asset.id, asset.dataUrl]),
            ),
          }
        : undefined;
    if (options.observe !== false) this.observeWrite(id, writeRevision);
    return project;
  }
  async list(): Promise<ProjectSummary[]> {
    const records = await (await this.db()).getAll("projects");
    return records
      .map(projectSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  async listPage(
    options: { limit?: number; before?: [string, string] } = {},
  ): Promise<{ projects: ProjectSummary[]; before: [string, string] | null }> {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Invalid project pagination.");
    const tx = (await this.db()).transaction("projects"),
      projects: ProjectSummary[] = [];
    let cursor = await tx.store
      .index("by-updated")
      .openCursor(
        options.before ? IDBKeyRange.upperBound(options.before, true) : undefined,
        "prev",
      );
    let last: [string, string] | null = null;
    while (cursor && projects.length < limit) {
      projects.push(projectSummary(cursor.value));
      last = [cursor.value.project.updatedAt, cursor.value.id];
      cursor = await cursor.continue();
    }
    await tx.done;
    return { projects, before: cursor ? last : null };
  }
  async rename(id: string, name: string): Promise<void> {
    const generation = this.generation;
    if (!name.trim() || name.length > 256) throw new Error("Nom de projet invalide.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const reading = (await this.db()).transaction("preferences");
      const expectedRevision = await readProjectWriteRevision(reading.store, id);
      await reading.done;
      this.assertGeneration(generation);
      const before = await this.load(id, { observe: false }),
        originalRevision =
          this.activeAssets?.projectId === id ? this.activeAssets.revision : undefined;
      const engine = new EditorEngine(before, { now: () => new Date().toISOString() });
      engine.execute({ type: "renameProject", name });
      const after = engine.getSnapshot().project,
        beforeState = stateFromProject(before),
        current = stateFromProject(after);
      const [beforeFingerprint, fingerprint] = await Promise.all([
        this.hash({ kind: "history", state: beforeState }, generation),
        this.hash({ kind: "history", state: current }, generation),
      ]);
      this.assertGeneration(generation);
      const tx = (await this.db()).transaction(["projects", ...HISTORY_WRITE_STORES], "readwrite"),
        done = tx.done;
      try {
        await assertProjectWriteRevision(tx.objectStore("preferences"), id, expectedRevision);
        const record = await tx.objectStore("projects").get(id);
        if (!record) throw new Error("Projet local introuvable.");
        const { assets, replay: _replay, ...document } = record.project;
        const expected = JSON.stringify(beforeState),
          actual = JSON.stringify({ ...document, assetIds: Object.keys(assets) });
        const originalsMatch =
          record.storageVersion === 2
            ? record.assetsRevision === originalRevision
            : Object.values(record.project.assets).every((asset) =>
                sameAssetOriginal(asset, before.assets[asset.id]),
              );
        if (expected !== actual || !originalsMatch) {
          await done;
          continue;
        }
        // This transaction includes every history store; its narrower port cannot touch projects.
        const history = tx as unknown as HistoryWrite;
        const meta = await initializeHistory(
          history,
          before,
          before.pages[0]!.id,
          beforeFingerprint,
        );
        const event = {
          projectId: id,
          pageId: after.pages[0]!.id,
          kind: "commit" as const,
          at: 0,
          commands: [{ type: "renameProject" as const, name }],
          delta: diffReplayState(beforeState, current),
          ...(meta.lastFingerprint !== beforeFingerprint ? { after: current } : {}),
        };
        await appendInTransaction(history, {
          projectId: id,
          event,
          assets: {},
          stamp: after.updatedAt,
          elapsed: 1,
          fingerprint,
        });
        record.project.name = after.name;
        record.project.updatedAt = after.updatedAt;
        if (record.bytes) record.bytes.manifest = manifestBytes(record);
        await tx.objectStore("projects").put(record);
        const writeRevision = await renewProjectWriteRevision(tx.objectStore("preferences"), id);
        await done;
        if (generation === this.generation) this.observeWrite(id, writeRevision);
        return;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* A failed native request may already abort. */
        }
        await done.catch(() => undefined);
        if (error instanceof StaleProjectWriteError) continue;
        throw error;
      }
    }
    throw new StaleProjectWriteError(id);
  }
  async usage(id: string) {
    return projectUsage(await this.db(), id);
  }
  estimateOriginStorage = estimateOriginStorage;
  async thumbnailInfo(projectId: string): Promise<ThumbnailInfo[]> {
    const persistence = (this.persistence ??= new PersistenceClient(this.name, () => this.db()));
    return persistence.info(projectId);
  }
  async thumbnails(
    projectId: string,
    pageIds?: readonly string[],
    allowStale = false,
  ): Promise<ThumbnailRead[]> {
    const persistence = (this.persistence ??= new PersistenceClient(this.name, () => this.db()));
    return persistence.thumbnails(projectId, pageIds, allowStale);
  }
  async saveThumbnail(thumbnail: StoredThumbnail): Promise<boolean> {
    const captured = { ...thumbnail };
    validateThumbnail(captured);
    const persistence = (this.persistence ??= new PersistenceClient(this.name, () => this.db()));
    return persistence.thumbnail(captured);
  }
  async last() {
    return (await this.db()).get("preferences", "last-project");
  }
  async isDeleted(id: string) {
    const tx = (await this.db()).transaction("preferences");
    const deleted = await isProjectDeleted(tx.store, id);
    await tx.done;
    return deleted;
  }
  async remove(id: string) {
    const tx = (await this.db()).transaction(
      [
        "projects",
        "assets",
        "mediaOriginals",
        "mediaOriginalMeta",
        "preferences",
        "journalMeta",
        "journalBase",
        "journalEvents",
        "journalAssets",
        "thumbnails",
      ],
      "readwrite",
    );
    const done = tx.done;
    try {
      await retireProject(tx.objectStore("preferences"), id);
      await tx.objectStore("projects").delete(id);
      await tx.objectStore("journalMeta").delete(id);
      await tx.objectStore("journalBase").delete(id);
      const historyRange = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
      await tx.objectStore("journalEvents").delete(historyRange);
      for (const key of await tx.objectStore("journalAssets").index("by-project").getAllKeys(id))
        await tx.objectStore("journalAssets").delete(key);
      for (const key of await tx.objectStore("thumbnails").index("by-project").getAllKeys(id))
        await tx.objectStore("thumbnails").delete(key);
      const assets = tx.objectStore("assets");
      for (const key of await assets.index("by-project").getAllKeys(id)) await assets.delete(key);
      for (const name of ["mediaOriginals", "mediaOriginalMeta"] as const) {
        const store = tx.objectStore(name);
        for (const key of await store.index("by-project").getAllKeys(id)) await store.delete(key);
      }
      await tx.objectStore("preferences").delete(`media-original-bytes:${id}`);
      await tx.objectStore("preferences").delete(projectPreferencesKey(id));
      if ((await tx.objectStore("preferences").get("last-project")) === id)
        await tx.objectStore("preferences").delete("last-project");
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Native request may already abort. */
      }
      await done.catch(() => undefined);
      throw error;
    }
    if (this.activeAssets?.projectId === id) this.activeAssets = undefined;
    this.observedWrites.delete(id);
  }
  async close() {
    this.generation++;
    this.digestMemo.reset();
    const persistence = this.persistence;
    this.persistence = undefined;
    this.hasher?.dispose();
    this.hasher = undefined;
    await persistence?.dispose();
    if (this.connection) {
      (await this.connection).close();
      this.connection = undefined;
    }
    this.activeAssets = undefined;
    this.observedWrites.clear();
  }
}
export function installAutosave(
  engine: EnginePort,
  store: Pick<ProjectStore, "save">,
  onError: (error: unknown) => void,
  delay = 350,
) {
  let previous = engine.getSnapshot().project;
  let pending: Project | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending) {
      const project = pending;
      pending = undefined;
      writes = writes.then(() => store.save(project)).catch(onError);
    }
    return writes;
  };
  const unsubscribe = engine.subscribe(() => {
    const project = engine.getSnapshot().project;
    if (project === previous) return;
    previous = project;
    pending = project;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, delay);
  });
  return {
    flush,
    dispose: () => {
      unsubscribe();
      return flush();
    },
  };
}
