import { openDB, type DBSchema } from "idb";
import type { ImageAsset, VideoAsset, Project } from "@musart/core";
import type { StoredMediaHeader, StoredMediaOriginal } from "./media/model";
import type {
  HistoryMetadata,
  HistoryBase,
  StoredHistoryEvent,
  StoredHistoryAsset,
} from "../history/model";

export type AssetMetadata = Omit<ImageAsset, "dataUrl"> | VideoAsset;
type ProjectManifest = Omit<Project, "assets"> & { assets: Record<string, AssetMetadata> };
export interface ProjectBytes {
  manifest: number;
  assets: number;
  thumbnails: number;
  /** Internal exact JSON page sizes, computed alongside pixel hashes off the UI thread. */
  pagePayloads?: number[];
}
import type { StoredThumbnail, ThumbnailInfo } from "./thumbnails/model";
export type { StoredThumbnail, ThumbnailInfo } from "./thumbnails/model";
interface LegacyProject {
  id: string;
  project: Project;
  storageVersion?: 1;
  thumbnail?: string;
  bytes?: ProjectBytes;
  pageRevisions?: Record<string, string>;
  thumbnailRenderVersion?: string;
  thumbnailInfo?: ThumbnailInfo[];
}
interface StoredManifest {
  id: string;
  project: ProjectManifest;
  storageVersion: 2;
  assetsRevision?: string;
  thumbnail?: string;
  bytes?: ProjectBytes;
  pageRevisions?: Record<string, string>;
  thumbnailRenderVersion?: string;
  thumbnailInfo?: ThumbnailInfo[];
}
export type StoredProject = LegacyProject | StoredManifest;
export interface StoredAsset {
  projectId: string;
  assetId: string;
  dataUrl: string;
}
export interface StudioDatabase extends DBSchema {
  projects: { key: string; value: StoredProject; indexes: { "by-updated": [string, string] } };
  thumbnails: { key: [string, string]; value: StoredThumbnail; indexes: { "by-project": string } };
  preferences: { key: string; value: string };
  journalMeta: { key: string; value: HistoryMetadata };
  journalBase: { key: string; value: HistoryBase };
  journalEvents: {
    key: [string, number];
    value: StoredHistoryEvent;
    indexes: {
      "by-project": string;
      "by-checkpoint": [string, string, number];
      "by-operation": [string, string];
    };
  };
  journalAssets: {
    key: [string, string];
    value: StoredHistoryAsset;
    indexes: { "by-project": string };
  };
  assets: { key: [string, string]; value: StoredAsset; indexes: { "by-project": string } };
  mediaOriginals: {
    key: [string, string];
    value: StoredMediaOriginal;
    indexes: { "by-project": string };
  };
  mediaOriginalMeta: {
    key: [string, string];
    value: StoredMediaHeader;
    indexes: { "by-project": string };
  };
}

/** One versioned connection schema; history records never enter project manifests. */
export function openStudioDatabase(name: string) {
  const opening = openDB<StudioDatabase>(name, 7, {
    upgrade(db, previousVersion, _newVersion, transaction) {
      if (previousVersion < 1) {
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("preferences");
      }
      if (previousVersion < 2) {
        const assets = db.createObjectStore("assets", { keyPath: ["projectId", "assetId"] });
        assets.createIndex("by-project", "projectId");
      }
      if (previousVersion < 3) {
        db.createObjectStore("journalMeta", { keyPath: "projectId" });
        db.createObjectStore("journalBase", { keyPath: "projectId" });
        const events = db.createObjectStore("journalEvents", {
          keyPath: ["projectId", "sequence"],
        });
        events.createIndex("by-project", "projectId");
        const originals = db.createObjectStore("journalAssets", {
          keyPath: ["projectId", "assetId"],
        });
        originals.createIndex("by-project", "projectId");
      }
      if (previousVersion < 4) {
        transaction
          .objectStore("journalEvents")
          .createIndex("by-checkpoint", ["projectId", "event.after.id", "sequence"]);
      }
      if (previousVersion < 5) {
        const thumbnails = db.createObjectStore("thumbnails", { keyPath: ["projectId", "pageId"] });
        thumbnails.createIndex("by-project", "projectId");
        transaction.objectStore("projects").createIndex("by-updated", ["project.updatedAt", "id"]);
      }
      if (previousVersion < 6)
        transaction
          .objectStore("journalEvents")
          .createIndex("by-operation", ["projectId", "operationId"], { unique: true });
      if (previousVersion < 7) {
        for (const name of ["mediaOriginals", "mediaOriginalMeta"] as const) {
          const originals = db.createObjectStore(name, { keyPath: ["projectId", "originalId"] });
          originals.createIndex("by-project", "projectId");
        }
      }
    },
    blocking() {
      void opening.then((db) => db.close());
    },
  });
  return opening;
}
