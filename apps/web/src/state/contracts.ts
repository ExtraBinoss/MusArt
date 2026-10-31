import type { ProjectTiming } from "../services/performance/project-timing";
import type { Composition, EnginePort, Project } from "@musart/core";
import type { MediaOriginalInput } from "../services/projects/media/model";
import type { FontLibraryPort } from "../services/fonts/model";
import type { PixelSelectionPort } from "../services/selection/wand/model";

export type ProjectMode = "static" | "motion";

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  height: number;
  thumbnail?: string;
  /** Any Motion artboard makes the project Motion; older summaries may omit this. */
  mode?: ProjectMode;
  pages: ProjectPageSummary[];
}
export interface ProjectLibraryOptions {
  limit?: number;
  before?: [string, string];
  ids?: readonly string[];
}
export interface ProjectLibraryPage {
  projects: ProjectSummary[];
  before: [string, string] | null;
}
export interface ProjectPageSummary {
  /** Derived from persisted artboard metadata without loading originals or history. */
  mode?: ProjectMode;
  id: string;
  name: string;
  width: number;
  height: number;
  thumbnailRevision?: string;
  thumbnailBytes?: number;
}
export interface ProjectThumbnailView {
  pageId: string;
  revision: string;
  url: string;
  width: number;
  height: number;
  stale?: boolean;
}
export interface ProjectThumbnailLease {
  items: ProjectThumbnailView[];
  release: () => void;
}
export interface ProjectUsage {
  projectId: string;
  basis: "logical-utf8";
  bytes: {
    manifest: number;
    assets: number;
    thumbnails: number;
    historyEvents: number;
    historyAssets: number;
    historyBase: number;
    historyMetadata: number;
    total: number;
  };
  history: { count: number; limit: number; enabled: boolean };
}
export interface OriginStorageEstimate {
  approximate: true;
  usage?: number;
  quota?: number;
}
export interface ProjectInsights extends ProjectUsage {
  origin?: OriginStorageEstimate;
}
export interface NewProjectOptions {
  presetId?: string;
  name: string;
  width: number;
  height: number;
  background: string;
}
export interface ExportOptions {
  signal?: AbortSignal;
  scale: number;
  format: "png" | "jpeg" | "webp";
  quality: number;
  allPages: boolean;
  selectionOnly?: boolean;
}
export interface ExportScope {
  page: Composition;
  revision: number;
  selection: readonly string[];
}
export type LayerPreviewVariant = { kind: "effect"; effectId: string } | { kind: "mask" };
export interface ExportPreviewOptions {
  /** A genuine intermediate effect or mask coverage preview, scoped to one selected owner. */
  variant?: LayerPreviewVariant;
  /** Explicit artboard previews remain valid when another artboard becomes active. */
  pageId?: string;
  selection?: readonly string[];
  all?: boolean;
  edge?: number;
  priority?: "foreground" | "visible" | "background";
}
export interface ExportPreview {
  blob: Blob;
  width: number;
  height: number;
}
export interface EditorServices {
  exportComposition?(
    this: void,
    options: import("../services/export/model").CompositionExportOptions,
    scope: import("../services/export/model").CompositionExportScope,
  ): Promise<import("../services/export/model").CompositionExportResult>;
  projectPreferences?: import("../services/projects/preferences/model").ProjectPreferencesPort;
  mediaResolverFor?(this: void, projectId: string): import("@musart/render").MediaSourceResolver;
  segmentationModel?: import("../services/selection/model/contract").LocalModelPort;
  pixelSelection?: PixelSelectionPort;
  previewExport?(
    this: void,
    options: ExportPreviewOptions,
    signal?: AbortSignal,
  ): Promise<ExportPreview>;
  fonts?: FontLibraryPort;
  listProjects(this: void): Promise<ProjectSummary[]>;
  listProjectPage(this: void, options?: ProjectLibraryOptions): Promise<ProjectLibraryPage>;
  openProject(this: void, id: string): Promise<void>;
  /** Read-only preview load: never publishes into the editor, remembers an active ID or writes storage. */
  loadProjectPreview?(this: void, id: string, options?: { signal?: AbortSignal }): Promise<Project>;
  createProject(this: void, options: NewProjectOptions): Promise<void>;
  saveProject(this: void): Promise<void>;
  deleteProject(this: void, id: string): Promise<void>;
  duplicateProject(this: void, id: string): Promise<void>;
  renameProject(this: void, id: string, name: string): Promise<void>;
  projectInsights(this: void, id: string): Promise<ProjectInsights>;
  clearHistory(this: void, id: string): Promise<void>;
  loadProjectThumbnails(
    this: void,
    id: string,
    pageIds?: readonly string[],
    options?: { allowStale?: boolean },
  ): Promise<ProjectThumbnailLease>;
  subscribeProjectThumbnails(this: void, listener: (projectId: string) => void): () => void;
  flushThumbnails(this: void): Promise<void>;
  importFiles(this: void, files: File[]): Promise<void>;
  openPortable(this: void, file: File): Promise<void>;
  /** Installs a portable manifest and its deduplicated native originals atomically. */
  openMediaProject?(
    this: void,
    project: Project,
    originals: readonly MediaOriginalInput[],
    options?: {
      signal?: AbortSignal;
      expectedOrigin?: { projectId: string; pageId: string; revision: number };
      timing?: ProjectTiming;
    },
  ): Promise<void>;
  exportProject(this: void): Promise<void>;
  exportImage(this: void, options: ExportOptions, scope?: ExportScope): Promise<void>;
  selectImagePoint(
    this: void,
    layerId: string,
    x: number,
    y: number,
    mode: "wand" | "segment",
    tolerance: number,
  ): Promise<void>;
  prepareSegmentation(this: void): Promise<void>;
}
export interface AppProps {
  engine: EnginePort;
  services: EditorServices;
  /** Initial empty-library session; the draft stays private until a real project is chosen. */
  welcome?: boolean;
  routing?: StudioRouting;
}
export interface StudioRouting {
  view: "dashboard" | "editor";
  projectId?: string;
  templateId?: string;
  navigate: (destination: "home" | "dashboard" | "editor", projectId?: string) => void;
}
