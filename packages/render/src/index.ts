export { renderComposition, clearRenderCaches } from "./compositing/compositor";
export type { RenderOptions } from "./compositing/compositor";
export { exportComposition } from "./export/export";
export type { ExportOptions } from "./export/export";
export { sourcePixels } from "./surface/sources";
export { GpuEffects } from "./effects/GpuEffects";
export { GpuCompositor } from "./compositing/GpuCompositor";
export type { FrameTexture, GpuStats } from "./compositing/types";

export { createRenderSession } from "./export/standalone";
export { exportMotionVideo, MotionExportError, createMotionPreview } from "./export/motion";
export type {
  MotionVideoExportOptions,
  MotionVideoExportResult,
  MotionPreviewOptions,
  MotionPreviewState,
} from "./export/motion";

export { RENDER_CAPABILITIES } from "./color/capabilities";
export type { FontResolver } from "./surface/text/fonts";
export { MAX_FONT_BYTES } from "./surface/text/fonts";

export type { MediaSourceResolver } from "./sources/media/model";
export { probeVideoOriginal } from "./sources/video/probe";
export type { VideoOriginalProbe } from "./sources/video/probe";
export { probeAudioOriginal } from "./sources/audio/probe";
export type { AudioOriginalProbe } from "./sources/audio/probe";
export { createMotionAudioMixer, openMotionAudioSource } from "./export/motion";
export type { MotionAudioPlan, MotionAudioSource, MotionPcmChunk } from "./export/motion";

export { estimatePreviewCost } from "./compositing/preview-cost";
export { gpuTextureLimit } from "./cache/texture-limits";
