export { FORMAT_VERSION } from "./document/model";
export type {
  Asset,
  Command,
  Composition,
  Effect,
  EffectType,
  EnginePort,
  Guide,
  Layer,
  LayerKind,
  LayerMask,
  Project,
  SessionSnapshot,
} from "./document/model";
export {
  createEffect,
  createId,
  createLayer,
  createPage,
  createProject,
  PRESETS,
} from "./document/factories";
export { EditorEngine } from "./session/engine";
export type { EngineOptions } from "./session/engine";
export { EngineError } from "./errors";
export type { EngineErrorCode } from "./errors";
export { validateProject } from "./document/validation";
export { parseProject, serializeProject } from "./document/serialization";
export {
  getAncestors,
  getDescendants,
  getWorldBounds,
  getWorldMatrix,
  hitTest,
  IDENTITY,
  invertMatrix,
  layerTransform,
  multiplyMatrices,
  snap,
  transformPoint,
} from "./layers/geometry";
export type { Bounds, Matrix, Point } from "./layers/geometry";

export { EFFECT_CATALOG, getEffectDefinition } from "./effects/catalog";
export type {
  BooleanEffectParameter,
  EffectDefinition,
  EffectParameter,
  NumberEffectParameter,
} from "./effects/catalog";
