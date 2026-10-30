import type { Composition, MotionFrameRate } from "@musart/core";
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
} & (
  | { mode: "static"; image: Omit<ExportOptions, "scale">; selection?: readonly string[] }
  | {
      mode: "motion";
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
