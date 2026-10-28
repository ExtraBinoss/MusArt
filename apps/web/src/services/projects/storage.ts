import type { IDBPDatabase } from "idb";
import {
  openStudioDatabase,
  type AssetMetadata,
  type StudioDatabase,
  type StoredThumbnail,
  type ThumbnailInfo,
  type StoredProject,
} from "./database";
import { thumbnailRevisions } from "./thumbnails/revisions";
import { thumbnailRevision } from "./thumbnails/revision";
import { logicalBytes } from "./logical-bytes";
import {
  legacyThumbnailBytes,
  manifestBytes,
  projectSummary,
  thumbnailBytes,
  thumbnailInfo,
} from "./records";
import { projectUsage, estimateOriginStorage } from "./usage";
import { appendInTransaction } from "../history/append";
import { initializeHistory } from "../history/initialization";
import { CanonicalHasher } from "../serialization/hashing/client";
import type { CanonicalHashJob } from "../serialization/hashing/protocol";
import { HISTORY_WRITE_STORES } from "../history/stores";
import type { HistoryWrite } from "../history/transactions";
import { HistoryStore } from "../history/store";
import { snapshotProject } from "./writes/snapshot";
import {
  readProjectWriteRevision,
  assertProjectWriteRevision,
  renewProjectWriteRevision,
  StaleProjectWriteError,
} from "./writes/revision";
import { isProjectDeleted, retireProject } from "./lifecycle";
import {
  validateProject,
  EditorEngine,
  diffReplayState,
  stateFromProject,
  type Asset,
  type Composition,
  type EnginePort,
  type Project,
} from "@musart/core";
import type { ProjectSummary } from "../../state/contracts";

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
  private generation = 0;
  private assertGeneration(generation: number) {
    if (generation !== this.generation)
      throw new DOMException("Project store operation was closed.", "AbortError");
  }
  private hash = (job: CanonicalHashJob, generation = this.generation) => {
    this.assertGeneration(generation);
    return (this.hasher ??= new CanonicalHasher()).hash(job, {
      isCurrent: () => generation === this.generation,
    });
  };
  thumbnailRevision = (page: Composition, assets: Record<string, Asset>) => {
    const generation = this.generation;
    return thumbnailRevision(page, assets, (job) => this.hash(job, generation));
  };
  readonly history = new HistoryStore(
    () => this.db(),
    (state) => this.hash({ kind: "history", state }),
  );
  constructor(private readonly name = "musart-studio") {}
  private db() {
    this.connection ??= openStudioDatabase(this.name).catch((error) => {
      this.connection = undefined;
      throw error;
    });
    return this.connection;
  }
  async save(
    input: Project,
    thumbnail?: string,
    options: { remember?: boolean; expectedRevision?: string; requireAbsent?: boolean } = {},
  ) {
    const generation = this.generation;
    const project = snapshotProject(input);
    validateProject(project);
    const db = await this.db();
    const reading = db.transaction("preferences");
    const currentRevision = await readProjectWriteRevision(reading.store, project.id);
    await reading.done;
    const expectedRevision = options.expectedRevision ?? currentRevision;
    if (expectedRevision !== currentRevision) throw new StaleProjectWriteError(project.id);
    const pageRevisions = await thumbnailRevisions(project.pages, project.assets, (job) =>
      this.hash(job, generation),
    );
    this.assertGeneration(generation);
    const tx = db.transaction(["projects", "assets", "preferences", "thumbnails"], "readwrite");
    const done = tx.done;
    const projectStore = tx.objectStore("projects");
    const assetStore = tx.objectStore("assets");
    const urls = new Map<string, string>();
    let revision = "",
      writeRevision = "";
    try {
      await assertProjectWriteRevision(tx.objectStore("preferences"), project.id, expectedRevision);
      const previous = await projectStore.get(project.id);
      if (options.requireAbsent && previous) throw new StaleProjectWriteError(project.id);
      const persisted =
        previous?.storageVersion === 2 &&
        typeof previous.assetsRevision === "string" &&
        this.activeAssets?.projectId === project.id &&
        this.activeAssets.revision === previous.assetsRevision
          ? this.activeAssets.urls
          : new Map(
              (await assetStore.index("by-project").getAll(project.id)).map((asset) => [
                asset.assetId,
                asset.dataUrl,
              ]),
            );
      let assetsBytes =
        (previous?.storageVersion === 2 ? previous.bytes?.assets : undefined) ??
        [...persisted].reduce(
          (sum, [assetId, dataUrl]) =>
            sum + logicalBytes({ projectId: project.id, assetId, dataUrl }),
          0,
        );
      const metadata: Record<string, AssetMetadata> = {};
      let changed = false;
      for (const asset of Object.values(project.assets)) {
        const { dataUrl, ...description } = asset;
        metadata[asset.id] = description;
        urls.set(asset.id, dataUrl);
        if (persisted.get(asset.id) !== dataUrl) {
          assetsBytes +=
            logicalBytes({ projectId: project.id, assetId: asset.id, dataUrl }) -
            (persisted.has(asset.id)
              ? logicalBytes({
                  projectId: project.id,
                  assetId: asset.id,
                  dataUrl: persisted.get(asset.id),
                })
              : 0);
          await assetStore.put({ projectId: project.id, assetId: asset.id, dataUrl });
          changed = true;
        }
      }
      for (const assetId of persisted.keys()) {
        if (!urls.has(assetId)) {
          assetsBytes -= logicalBytes({
            projectId: project.id,
            assetId,
            dataUrl: persisted.get(assetId),
          });
          await assetStore.delete([project.id, assetId]);
          changed = true;
        }
      }
      revision = previous?.storageVersion === 2 ? (previous.assetsRevision ?? "") : "";
      if (changed || !revision) {
        const sequence = Number(
          (await tx.objectStore("preferences").get("asset-revision-sequence")) ?? "0",
        );
        if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= Number.MAX_SAFE_INTEGER)
          throw new Error("Compteur des ressources locales invalide.");
        revision = `assets:${sequence + 1}`;
        await tx.objectStore("preferences").put(String(sequence + 1), "asset-revision-sequence");
      }
      const preview = thumbnail ?? previous?.thumbnail;
      let storedThumbnails = previous ? previous.thumbnailInfo : [];
      let thumbnailsBytes = previous ? previous.bytes?.thumbnails : 0;
      if (storedThumbnails === undefined || thumbnailsBytes === undefined) {
        const records = await tx.objectStore("thumbnails").index("by-project").getAll(project.id);
        storedThumbnails = records.map(thumbnailInfo);
        thumbnailsBytes = records.reduce(
          (sum, record) => sum + thumbnailBytes(record),
          legacyThumbnailBytes(previous?.thumbnail),
        );
      }
      for (const info of storedThumbnails) {
        if (!Object.hasOwn(pageRevisions, info.pageId)) {
          const old = await tx.objectStore("thumbnails").get([project.id, info.pageId]);
          if (old) thumbnailsBytes -= thumbnailBytes(old);
          await tx.objectStore("thumbnails").delete([project.id, info.pageId]);
        }
      }
      thumbnailsBytes += legacyThumbnailBytes(preview) - legacyThumbnailBytes(previous?.thumbnail);
      const record: StoredProject = {
        id: project.id,
        storageVersion: 2,
        assetsRevision: revision,
        project: { ...project, assets: metadata },
        pageRevisions,
        thumbnailInfo: storedThumbnails.filter((info) => Object.hasOwn(pageRevisions, info.pageId)),
        ...(preview ? { thumbnail: preview } : {}),
      };
      record.bytes = {
        manifest: manifestBytes(record),
        assets: assetsBytes,
        thumbnails: thumbnailsBytes,
      };
      await projectStore.put(record);
      writeRevision = await renewProjectWriteRevision(tx.objectStore("preferences"), project.id);
      if (options.remember !== false)
        await tx.objectStore("preferences").put(project.id, "last-project");
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A failing IndexedDB request may already have aborted it. */
      }
      await done.catch(() => undefined);
      throw error;
    }
    // Publishing the comparison cache before commit would hide writes after a failed transaction.
    this.activeAssets = { projectId: project.id, revision, urls };
    this.observeWrite(project.id, writeRevision);
  }
  /** Editor writes retain their loaded baseline; unknown existing projects must be reopened. */
  saveCurrent(project: Project): Promise<void> {
    const expected = this.observedWrites.get(project.id);
    return this.save(project, undefined, {
      expectedRevision: expected ?? "",
      requireAbsent: expected === undefined,
    });
  }
  async load(
    id: string,
    options: { observe?: boolean; remember?: boolean } = {},
  ): Promise<Project> {
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
        const original = await tx.objectStore("assets").get([id, assetId]);
        if (!original) throw new Error(`Ressource locale manquante : ${metadata.name}.`);
        assets[assetId] = { ...metadata, dataUrl: original.dataUrl };
      }
      project = { ...record.project, assets };
    } else project = record.project;
    validateProject(project);
    if (project.id !== id) throw new Error("Identité du projet local incohérente.");
    if (tx.mode === "readwrite") await tx.objectStore("preferences").put(id, "last-project");
    await tx.done;
    this.activeAssets =
      record.storageVersion === 2 && typeof record.assetsRevision === "string"
        ? {
            projectId: id,
            revision: record.assetsRevision,
            urls: new Map(Object.values(project.assets).map((asset) => [asset.id, asset.dataUrl])),
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
            : Object.values(record.project.assets).every(
                (asset) => asset.dataUrl === before.assets[asset.id]?.dataUrl,
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
        this.observeWrite(id, writeRevision);
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
    return (await (await this.db()).get("projects", projectId))?.thumbnailInfo ?? [];
  }
  async thumbnails(projectId: string, pageIds?: readonly string[]): Promise<StoredThumbnail[]> {
    const tx = (await this.db()).transaction(["projects", "thumbnails"]);
    const project = await tx.objectStore("projects").get(projectId);
    if (!project) {
      await tx.done;
      return [];
    }
    const records = pageIds
      ? await Promise.all(
          [...new Set(pageIds)].map((pageId) =>
            tx.objectStore("thumbnails").get([projectId, pageId]),
          ),
        )
      : await tx.objectStore("thumbnails").index("by-project").getAll(projectId);
    await tx.done;
    return records.filter(
      (record): record is StoredThumbnail =>
        record !== undefined && record.revision === project.pageRevisions?.[record.pageId],
    );
  }
  async saveThumbnail(thumbnail: StoredThumbnail): Promise<boolean> {
    if (
      !(thumbnail.blob instanceof Blob) ||
      thumbnail.blob.size > 1024 * 1024 ||
      thumbnail.width < 1 ||
      thumbnail.height < 1 ||
      thumbnail.width > 768 ||
      thumbnail.height > 768 ||
      !Number.isInteger(thumbnail.width) ||
      !Number.isInteger(thumbnail.height)
    )
      throw new Error("Invalid thumbnail.");
    const tx = (await this.db()).transaction(["projects", "thumbnails"], "readwrite"),
      done = tx.done;
    try {
      const project = await tx.objectStore("projects").get(thumbnail.projectId);
      if (!project || project.pageRevisions?.[thumbnail.pageId] !== thumbnail.revision) {
        await done;
        return false;
      }
      const previous = await tx
        .objectStore("thumbnails")
        .get([thumbnail.projectId, thumbnail.pageId]);
      await tx.objectStore("thumbnails").put(thumbnail);
      project.thumbnailInfo = [
        ...(project.thumbnailInfo ?? []).filter((info) => info.pageId !== thumbnail.pageId),
        thumbnailInfo(thumbnail),
      ];
      if (project.bytes) {
        project.bytes.thumbnails +=
          thumbnailBytes(thumbnail) - (previous ? thumbnailBytes(previous) : 0);
        project.bytes.manifest = manifestBytes(project);
      }
      await tx.objectStore("projects").put(project);
      await done;
      return true;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Native transaction may already be aborted. */
      }
      await done.catch(() => undefined);
      throw error;
    }
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
    this.hasher?.dispose();
    this.hasher = undefined;
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
