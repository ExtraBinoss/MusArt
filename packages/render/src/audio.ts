/** GPU-free public entry point for native audio workers and headless audio consumers. */
export { createMotionAudioMixer } from "./export/motion/audio/mixer";
export { openMotionAudioSource } from "./export/motion/audio/source";
export { probeAudioOriginal } from "./sources/audio/probe";
export type { AudioOriginalProbe } from "./sources/audio/probe";
export type {
  MotionAudioPlan,
  MotionAudioSource,
  MotionPcmChunk,
} from "./export/motion/audio/model";
export type { MediaSourceResolver } from "./sources/media/model";
