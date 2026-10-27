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
  ChoiceEffectParameter,
  ColorEffectParameter,
} from "./effects/catalog";
export {
  getEffectParameter,
  patchEffectParameter,
  isEffectParameterVisible,
} from "./effects/parameters";
export type { EffectParameterValue } from "./effects/parameters";
export { GRADIENT_STYLES, GRADIENT_TREATMENTS } from "./effects/gradient/model";
export type {
  GradientStyle,
  GradientTreatment,
  GradientSettings,
  GradientSettingKey,
} from "./effects/gradient/model";
export { GRADIENT_PRESETS } from "./effects/gradient/presets";
export { GRADIENT_DEFAULT_SETTINGS, resolveGradientSettings } from "./effects/gradient/definition";
export { EFFECT_COMPOSITE_MODES } from "./effects/compositing";
export type { EffectCompositeMode } from "./effects/compositing";
export { BLEND_CATALOG, BLEND_MODES, getBlendDefinition } from "./layers/blending/catalog";
export type { BlendMode, BlendDefinition, BlendCategory } from "./layers/blending/catalog";
export type { VectorDefinition, VectorPart } from "./vector/model";
export { ZERO_INSETS } from "./layout/model";
export type { Insets, WorkingColorSpace, Alignment, LayoutReference } from "./layout/model";
export type {
  ReplaySpec,
  ReplayEvent,
  ReplayState,
  ReplayCommand,
  ReplayCommandSummary,
  ReplayRecording,
  CommandCommit,
} from "./animation/model";
export { SOCIAL_PRESETS, safeAreaGuides, pageFromPreset } from "./layout/presets";
export type { CompositionPreset, PresetBrand } from "./layout/presets";
export { layoutBoxes, measureLayer } from "./layout/measurements";
export type { LayerMeasurement, MeasurementArrow } from "./layout/measurements";
export { stateFromProject, normalizeReplayCommands } from "./animation/state";
export { diffReplayState, applyReplayDelta } from "./animation/delta";
export { recordSession, observeReplay } from "./animation/recording";
export type {
  ReplayDelta,
  ReplayPath,
  ReplayObserveOptions,
  ReplayRecordOptions,
} from "./animation/model";
export { evaluateReplay } from "./animation/evaluate";

export { validateReplaySpec, projectFromReplayState } from "./animation/validation";
export type { FillGradient, GradientStop } from "./paint/gradient";
export { validateFillGradient, sampleGradientColor } from "./paint/gradient";
export { selectionComposition } from "./export/selection";
export { createLayerGeometryIndex, LayerGeometryIndex } from "./layers/geometry-index";
