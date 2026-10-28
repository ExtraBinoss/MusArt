import type { Asset, Project } from "../document/model";

export interface ClipboardContent {
  format: "musart.clipboard";
  version: 1;
  kind: "selection" | "composition";
  sourceProjectId: string;
  document: Project;
  selection: string[];
  references: Record<string, Omit<Asset, "dataUrl"> & { fingerprint: string }>;
}
