export const EFFECT_COMPOSITE_MODES = Object.freeze([
  "source-over",
  "destination-over",
  "source-in",
  "destination-in",
  "source-out",
  "destination-out",
  "source-atop",
  "destination-atop",
  "xor",
  "copy",
  "destination",
  "clear",
  "lighter",
] as const);
export type EffectCompositeMode = (typeof EFFECT_COMPOSITE_MODES)[number];
