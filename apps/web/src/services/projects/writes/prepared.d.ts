import type { Project } from "@musart/core";
import type { MediaOriginalInput, StoredMediaOriginal } from "../media/model";
import type { ProjectWriteFrame } from "../persistence/model";
export interface SaveProjectOptions {
  remember?: boolean;
  expectedRevision?: string;
  requireAbsent?: boolean;
  mediaOriginals?: readonly MediaOriginalInput[];
}
/** Opaque single-use preparation token owned by the creating ProjectStore. */
export interface PreparedProjectSave {
  readonly project: Project;
}
export interface PreparedProjectWrite {
  project: Project;
  frame: ProjectWriteFrame;
  urls: Map<string, string>;
  originals: StoredMediaOriginal[];
  generation: number;
}
