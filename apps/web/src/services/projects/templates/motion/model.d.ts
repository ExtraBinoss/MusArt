import type { Command, ImageAsset, Project, VideoAsset } from "@musart/core";

export type MotionTemplateId = "in-bloom" | "motion-stress-lab";

/** Source descriptions are portable; binary video originals travel in the bundle sidecar. */
export interface MotionTemplateMedia {
  readonly photos: readonly ImageAsset[];
  readonly video: VideoAsset;
}

export interface BuiltMotionTemplate {
  readonly initial: Project;
  readonly project: Project;
  /** Preserve transaction boundaries: initialization plans include their origin revision. */
  readonly batches: readonly (readonly Command[])[];
}

export interface MotionTemplateManifest {
  readonly version: 1;
  readonly templateId: MotionTemplateId;
  readonly project: Project;
  readonly originals: readonly {
    readonly originalId: string;
    readonly contentRevision: string;
    readonly file: string;
    readonly byteLength: number;
    readonly mime: string;
  }[];
}
