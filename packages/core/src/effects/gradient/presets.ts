import type { GradientSettings } from "./model";
export interface GradientPreset {
  readonly id: string;
  readonly nameKey: string;
  readonly colors: readonly string[];
  readonly seed: number;
  readonly scale: number;
  readonly settings: Readonly<Partial<GradientSettings>>;
}
const preset = (
  id: string,
  colors: readonly string[],
  seed: number,
  settings: Partial<GradientSettings>,
  scale = 1,
): GradientPreset =>
  Object.freeze({
    id,
    nameKey: `gradientFx:preset.${id}`,
    colors: Object.freeze([...colors]),
    seed,
    scale,
    settings: Object.freeze(settings),
  });
/** Curated original Gradia presets, MIT ExtraBinoss/Plinka2026; see docs/rendering/shader-ports.md. */
export const GRADIENT_PRESETS: readonly GradientPreset[] = Object.freeze([
  preset("daydream", ["#27134f", "#6638e8", "#ef879b", "#ffad72", "#fce5c6"], 42, {
    style: "mesh",
    rotation: 35,
    amplitude: 3.5,
  }),
  preset("silk", ["#b4ac9f", "#ded5c6", "#f6eee2", "#d7bda6"], 60, {
    style: "silk",
    rotation: 25,
    grain: 0.05,
    saturation: 0.7,
    amplitude: 2,
  }),
  preset("aurora", ["#061e2f", "#126657", "#8ed6b2", "#addded", "#3649aa"], 42, {
    style: "aurora",
    rotation: 125,
    pressureX: 4.5,
    flow: 1.1,
  }),
  preset("ultraviolet", ["#0c0929", "#31207e", "#7f43e8", "#b3a0ef", "#e3c5e4"], 83, {
    style: "liquid",
    rotation: 160,
    flow: 1.4,
  }),
  preset("tidal", ["#052047", "#164ca0", "#41aab5", "#b6e7dc", "#eef4d7"], 23, {
    style: "waves",
    rotation: 220,
    frequencyY: 4,
    flow: 1.2,
  }),
  preset(
    "citrus",
    ["#526e28", "#b3ce54", "#f4e78b", "#f4ac49", "#fbe2be"],
    79,
    { style: "radial", frequencyX: 1.2, rotation: 45, centerX: -0.3 },
    0.9,
  ),
  preset("stripes", ["#058066", "#059e5c", "#30e091", "#069cfc"], 0, {
    style: "stripes",
    speed: 1,
    duration: 24,
    rotation: 0,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    grain: 0.08,
    vignette: 0,
  }),
  preset("pearl", ["#9ba8b8", "#d3c9d5", "#f5eee6", "#e1e7e2"], 17, {
    style: "silk",
    saturation: 0.65,
    amplitude: 1.6,
    grain: 0.03,
  }),
  preset("chrome", ["#171f2d", "#707f95", "#c6d2df", "#f4f4eb"], 22, {
    style: "silk",
    rotation: 20,
    contrast: 1.3,
    saturation: 0.35,
    frequencyY: 2.2,
    grain: 0.015,
  }),
]);
export function gradientPresetSettings(preset: GradientPreset): Partial<GradientSettings> {
  const colors = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [
      `color${index}`,
      preset.colors[index] ?? preset.colors.at(-1)!,
    ]),
  );
  return { ...preset.settings, ...colors, preset: preset.id, colorCount: preset.colors.length };
}
