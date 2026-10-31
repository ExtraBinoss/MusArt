import type { Composition, MotionFrameRate } from "@musart/core";
import type { ManagedImageOptions } from "@musart/render";
import type { ExportOptions } from "../../state/contracts";

/** IDs choose the target independently of the editing page; identity rejects same-ID reloads. */
export interface CompositionExportScope {
  projectId: string;
  compositionId: string;
  revision: number;
  page: Composition;
}
export type CompositionExportOptions = {
  compositionId: string;
  scale: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Export the frozen start snapshot while edits continue in the same project. */
  background?: boolean;
  beforeFrame?: () => Promise<void>;
} & (
  | {
      mode: "static";
      image: Omit<ExportOptions, "scale" | "format"> &
        Partial<ManagedImageOptions> & { format: ManagedImageOptions["format"] };
      selection?: readonly string[];
    }
  | {
      mode: "motion";
      selection?: readonly string[];
      container: "auto" | "mp4" | "webm";
      frameRate?: MotionFrameRate;
      videoBitrate?: number;
      audioBitrate?: number;
      audio?: boolean;
    }
);
export interface CompositionExportResult {
  mode: "static" | "motion";
  filename: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
}
