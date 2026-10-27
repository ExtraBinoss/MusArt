import type { EnginePort } from "@musart/core";

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  height: number;
  thumbnail?: string;
}
export interface NewProjectOptions {
  name: string;
  width: number;
  height: number;
  background: string;
}
export interface ExportOptions {
  scale: number;
  format: "png" | "jpeg" | "webp";
  quality: number;
  allPages: boolean;
}
export interface EditorServices {
  listProjects(this: void): Promise<ProjectSummary[]>;
  openProject(this: void, id: string): Promise<void>;
  createProject(this: void, options: NewProjectOptions): Promise<void>;
  saveProject(this: void): Promise<void>;
  deleteProject(this: void, id: string): Promise<void>;
  duplicateProject(this: void, id: string): Promise<void>;
  importFiles(this: void, files: File[]): Promise<void>;
  openPortable(this: void, file: File): Promise<void>;
  exportProject(this: void): Promise<void>;
  exportImage(this: void, options: ExportOptions): Promise<void>;
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
}
