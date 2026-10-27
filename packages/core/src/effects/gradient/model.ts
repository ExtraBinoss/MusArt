export const GRADIENT_STYLES = Object.freeze([
  "mesh",
  "silk",
  "aurora",
  "liquid",
  "radial",
  "waves",
  "stripes",
] as const);
export type GradientStyle = (typeof GRADIENT_STYLES)[number];
export const GRADIENT_TREATMENTS = Object.freeze([
  "none",
  "ascii",
  "dither",
  "blocks",
  "glass",
  "folds",
] as const);
export type GradientTreatment = (typeof GRADIENT_TREATMENTS)[number];
/** Portable settings for the single Gradient FX; each style/treatment owns its GPU implementation. */
export interface GradientSettings {
  preset: string;
  style: GradientStyle;
  treatment: GradientTreatment;
  colorCount: number;
  color0: string;
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  influence0: number;
  influence1: number;
  influence2: number;
  influence3: number;
  influence4: number;
  influence5: number;
  rotation: number;
  centerX: number;
  centerY: number;
  stretch: number;
  twist: number;
  amplitude: number;
  frequencyX: number;
  frequencyY: number;
  blending: number;
  pressureX: number;
  pressureY: number;
  flow: number;
  speed: number;
  duration: number;
  brightness: number;
  saturation: number;
  shadows: number;
  highlights: number;
  contrast: number;
  hue: number;
  grain: number;
  grainScale: number;
  vignette: number;
  chromaticShift: number;
  borderRadius: number;
  size: number;
  aspect: number;
  feather: number;
  gap: number;
  roundness: number;
  relief: number;
  variation: number;
  treatmentRotation: number;
  refraction: number;
  blur: number;
  dispersion: number;
  highlight: number;
  frost: number;
  depth: number;
  softness: number;
  shadow: number;
  phase: number;
}
export type GradientSettingKey = keyof GradientSettings;
