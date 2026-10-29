import type { Project } from "@musart/core";
import type { AssetMetadata, StoredAsset, StoredThumbnail, ThumbnailInfo } from "../database";
import type { ThumbnailRead } from "../thumbnails/model";
import type { FragmentPart } from "../../serialization/fragments/model";
import type { StoredMediaOriginal } from "../media/model";
export interface ProjectWriteFrame {
  document: Omit<Project, "assets">;
  descriptions: AssetMetadata[];
  originals: StoredAsset[];
  basis?: string;
  pageRevisions: Record<string, string>;
  thumbnailRenderVersion: string;
  pagePayloads?: number[];
  thumbnail?: string;
  expectedRevision: string;
  requireAbsent: boolean;
  remember: boolean;
}
export interface ProjectWriteResult {
  projectId: string;
  assetsRevision: string;
  writeRevision: string;
}
export type PersistenceResult =
  | { kind: "save"; value: ProjectWriteResult }
  | { kind: "thumbnail"; value: boolean }
  | { kind: "info"; value: ThumbnailInfo[] }
  | { kind: "thumbnails"; value: ThumbnailRead[] };
export type PersistenceRequest =
  | { type: "begin"; id: number; database: string }
  | { type: "part"; id: number; part: FragmentPart }
  | { type: "media"; id: number; original: StoredMediaOriginal }
  | { type: "finish"; id: number; parts: number }
  | { type: "thumbnail"; id: number; database: string; record: StoredThumbnail }
  | { type: "info"; id: number; database: string; projectId: string }
  | {
      type: "thumbnails";
      id: number;
      database: string;
      projectId: string;
      pageIds?: readonly string[];
      allowStale?: boolean;
    };
export type PersistenceResponse =
  | { id: number; result: PersistenceResult }
  | { id: number; error: { name: string; message: string; code?: string } };
export interface PersistenceWorkerPort {
  postMessage(message: PersistenceRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}
