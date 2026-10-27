import {
  GRADIENT_STYLES,
  resolveGradientSettings,
  type Effect,
  type GradientSettings,
} from "@musart/core";
import { Vector3, type UniformNode } from "three/webgpu";
import { uniform } from "three/tsl";
import { parseColor } from "../../../compositing/nodes/color";

type NumericKey = {
  [K in keyof GradientSettings]: GradientSettings[K] extends number ? K : never;
}[keyof GradientSettings];
const values = resolveGradientSettings();
const numericKeys = Object.keys(values).filter(
  (key): key is NumericKey => typeof values[key as keyof GradientSettings] === "number",
);
export function createGradientUniforms(effect: Effect) {
  const settings = resolveGradientSettings(effect.settings);
  const numbers = Object.fromEntries(
    numericKeys.map((key) => [key, uniform(settings[key])]),
  ) as Record<NumericKey, UniformNode<"float", number>>;
  const colors = Array.from({ length: 6 }, (_, i) => {
    const rgba = parseColor(settings[`color${i}` as keyof GradientSettings] as string);
    return uniform(new Vector3(rgba.x, rgba.y, rgba.z));
  });
  return {
    ...numbers,
    colors,
    style: uniform(GRADIENT_STYLES.indexOf(settings.style)),
    time: uniform(effect.time ?? 0),
    scale: uniform(effect.scale),
    seed: uniform(effect.seed),
  };
}
export type GradientUniforms = ReturnType<typeof createGradientUniforms>;
export function updateGradientUniforms(controls: GradientUniforms, effect: Effect): void {
  const settings = resolveGradientSettings(effect.settings);
  for (const key of numericKeys) controls[key].value = settings[key];
  controls.colors.forEach((color, i) => {
    const rgba = parseColor(settings[`color${i}` as keyof GradientSettings] as string);
    color.value.set(rgba.x, rgba.y, rgba.z);
  });
  controls.style.value = GRADIENT_STYLES.indexOf(settings.style);
  controls.time.value = effect.time ?? 0;
  controls.scale.value = effect.scale;
  controls.seed.value = effect.seed;
}
