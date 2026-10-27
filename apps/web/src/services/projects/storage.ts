import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { validateProject, type Asset, type EnginePort, type Project } from "@musart/core";
import type { ProjectSummary } from "../../state/contracts";

type AssetMetadata = Omit<Asset, "dataUrl">;
type ProjectManifest = Omit<Project, "assets"> & { assets: Record<string, AssetMetadata> };
interface LegacyProject {
  id: string;
  project: Project;
  storageVersion?: 1;
  thumbnail?: string;
}
interface StoredManifest {
  id: string;
  project: ProjectManifest;
  storageVersion: 2;
  assetsRevision?: string;
  thumbnail?: string;
}
type StoredProject = LegacyProject | StoredManifest;
interface StoredAsset {
  projectId: string;
  assetId: string;
  dataUrl: string;
}
interface StudioDatabase extends DBSchema {
  projects: { key: string; value: StoredProject };
  preferences: { key: string; value: string };
  assets: { key: [string, string]; value: StoredAsset; indexes: { "by-project": string } };
}

/** Original bytes are persisted independently from small, frequently changing manifests. */
export class ProjectStore {
  private connection: Promise<IDBPDatabase<StudioDatabase>> | undefined;
  // Only the most recently opened/saved project's originals are retained for write comparison.
  private activeAssets:
    | { projectId: string; revision: string; urls: Map<string, string> }
    | undefined;
  constructor(private readonly name = "musart-studio") {}
  private db() {
    this.connection ??= openDB<StudioDatabase>(this.name, 2, {
      upgrade(db, previousVersion) {
        if (previousVersion < 1) {
          db.createObjectStore("projects", { keyPath: "id" });
          db.createObjectStore("preferences");
        }
        if (previousVersion < 2) {
          const assets = db.createObjectStore("assets", { keyPath: ["projectId", "assetId"] });
          assets.createIndex("by-project", "projectId");
        }
      },
    }).catch((error) => {
      this.connection = undefined;
      throw error;
    });
    return this.connection;
  }
  async save(project: Project, thumbnail?: string) {
    validateProject(project);
    const db = await this.db();
    const tx = db.transaction(["projects", "assets", "preferences"], "readwrite");
    const done = tx.done;
    const projectStore = tx.objectStore("projects");
    const assetStore = tx.objectStore("assets");
    const urls = new Map<string, string>();
    let revision = "";
    try {
      const previous = await projectStore.get(project.id);
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
      const metadata: Record<string, AssetMetadata> = {};
      let changed = false;
      for (const asset of Object.values(project.assets)) {
        const { dataUrl, ...description } = asset;
        metadata[asset.id] = description;
        urls.set(asset.id, dataUrl);
        if (persisted.get(asset.id) !== dataUrl) {
          await assetStore.put({ projectId: project.id, assetId: asset.id, dataUrl });
          changed = true;
        }
      }
      for (const assetId of persisted.keys()) {
        if (!urls.has(assetId)) {
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
      await projectStore.put({
        id: project.id,
        storageVersion: 2,
        assetsRevision: revision,
        project: { ...project, assets: metadata },
        ...(preview ? { thumbnail: preview } : {}),
      });
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
  }
  async load(id: string): Promise<Project> {
    const db = await this.db();
    const tx = db.transaction(["projects", "assets"], "readonly");
    const record = await tx.objectStore("projects").get(id);
    if (!record) throw new Error("Projet local introuvable.");
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
    await tx.done;
    validateProject(project);
    if (project.id !== id) throw new Error("Identité du projet local incohérente.");
    this.activeAssets =
      record.storageVersion === 2 && typeof record.assetsRevision === "string"
        ? {
            projectId: id,
            revision: record.assetsRevision,
            urls: new Map(Object.values(project.assets).map((asset) => [asset.id, asset.dataUrl])),
          }
        : undefined;
    return project;
  }
  async list(): Promise<ProjectSummary[]> {
    const records = await (await this.db()).getAll("projects");
    return records
      .map(({ project, thumbnail }) => ({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        width: project.pages[0]!.width,
        height: project.pages[0]!.height,
        ...(thumbnail ? { thumbnail } : {}),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  async last() {
    return (await this.db()).get("preferences", "last-project");
  }
  async remove(id: string) {
    const tx = (await this.db()).transaction(["projects", "assets", "preferences"], "readwrite");
    await tx.objectStore("projects").delete(id);
    const assets = tx.objectStore("assets");
    for (const key of await assets.index("by-project").getAllKeys(id)) await assets.delete(key);
    if ((await tx.objectStore("preferences").get("last-project")) === id)
      await tx.objectStore("preferences").delete("last-project");
    await tx.done;
    if (this.activeAssets?.projectId === id) this.activeAssets = undefined;
  }
  async close() {
    if (this.connection) {
      (await this.connection).close();
      this.connection = undefined;
    }
    this.activeAssets = undefined;
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
