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
export {
  isPublishedProject,
  isPublishedComposition,
  isPublishedAssets,
} from "./document/published";
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
export { SnapIndex } from "./layout/snapping/engine";
export type { SnapCue, SnapResult, SnapKind } from "./layout/snapping/model";

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
  validateEffectParameter,
} from "./effects/parameters";
export type { EffectParameterValue } from "./effects/parameters";
export { resolveEffectSettings } from "./effects/settings";
export type { EffectSettings } from "./document/model";
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
  CommandCommitInfo,
} from "./animation/model";
export { SOCIAL_PRESETS, safeAreaGuides, pageFromPreset } from "./layout/presets";
export type { CompositionPreset, PresetBrand } from "./layout/presets";
export { layoutBoxes, measureLayer } from "./layout/measurements";
export type { LayerMeasurement, MeasurementArrow } from "./layout/measurements";
export { stateFromProject, normalizeReplayCommands } from "./animation/state";
export { isCommandType } from "./session/registry";
export { diffReplayState, applyReplayDelta } from "./animation/delta";
export { recordSession, observeReplay } from "./animation/recording";
export { observeReplayTransitions } from "./animation/transitions";
export type {
  ReplayDelta,
  ReplayPath,
  ReplayObserveOptions,
  ReplayTransition,
  ReplayTransitionOptions,
  ReplayRecordOptions,
} from "./animation/model";
export { evaluateReplay } from "./animation/evaluate";

export { validateReplaySpec, projectFromReplayState } from "./animation/validation";
export type { FillGradient, GradientStop } from "./paint/gradient";
export { validateFillGradient, sampleGradientColor } from "./paint/gradient";
export { selectionComposition } from "./export/selection";
export type {
  CompositionMotion,
  MotionCommand,
  MotionInitializationPlan,
  MotionKeyframe,
  MotionLayerTrack,
  MotionPropertyTrack,
} from "./motion/model";
export type { MotionTime, MotionFrameRate } from "./motion/time";
export type { MotionEasing } from "./motion/easing";
export type { MotionPropertyTarget, MotionValue } from "./motion/properties/model";
export { planMotionInitialization } from "./motion/initialization";
export {
  frameTime,
  compareMotionTime,
  motionTimeToSeconds,
  normalizeMotionTime,
  normalizeMotionFrameRate,
  addMotionTime,
  subtractMotionTime,
  motionTimeProgress,
} from "./motion/time";
export {
  evaluateEasing,
  createMotionEasingPreset,
  MOTION_EASING_PRESETS,
  compileMotionEasing,
  isMotionEasing,
  validateMotionEasing,
} from "./motion/easing";
export type { MotionEasingPreset } from "./motion/easing";
export type {
  MotionPropertyDescriptor,
  LayerMotionProperty,
  EffectMotionProperty,
  EffectMotionCapability,
} from "./motion/properties/model";
export {
  resolveMotionProperty,
  resolveLayerMotionProperty,
  listMotionProperties,
  readMotionValue,
  validateMotionValue,
  effectMotionCapabilityInventory,
} from "./motion/properties/registry";
export { applyMotionValue, applyMotionValues } from "./motion/properties/apply";
export { compileMotion } from "./motion/compile";
export type { MotionProgram } from "./motion/compile";
export { evaluateMotion } from "./motion/evaluate";
export type { MotionFramePlan, MotionEvaluationOptions } from "./motion/evaluate";
export { applyMotionFrame } from "./motion/frame";
export { validateMotionTime } from "./motion/time";
export { createLayerGeometryIndex, LayerGeometryIndex } from "./layers/geometry-index";
export { copyContent, parseClipboard, MAX_CLIPBOARD_CHARACTERS } from "./clipboard/content";
export { pasteContent } from "./clipboard/paste";
export type { ClipboardContent } from "./clipboard/model";
