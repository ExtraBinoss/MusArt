import {
  getEffectDefinition,
  resolveEffectSettings,
  validateEffectParameter,
  type Effect,
  type EffectParameter,
} from "@musart/core";
import { Vector3, type UniformNode } from "three/webgpu";
import { uniform } from "three/tsl";
import { parseColor } from "../../compositing/nodes/color";

export interface ParameterUniforms {
  readonly parameters: Record<string, UniformNode<"float", number>>;
  readonly colors: Record<string, UniformNode<"vec3", Vector3>>;
}
const scoped = (parameter: EffectParameter) =>
  "scope" in parameter && parameter.scope === "settings";
function numberValue(parameter: EffectParameter, value: number | boolean | string): number {
  if (parameter.kind === "select")
    return parameter.options.findIndex((option) => option.value === value);
  return Number(value);
}

/** Definition-owned scalar fields share one stable uniform transport for every effect. */
export function createParameterUniforms(effect: Effect): ParameterUniforms {
  const parameters: ParameterUniforms["parameters"] = {},
    colors: ParameterUniforms["colors"] = {};
  if (effect.type === "gradient") return { parameters, colors };
  const settings = resolveEffectSettings(effect);
  for (const parameter of getEffectDefinition(effect.type).parameters.filter(scoped)) {
    const value = settings[parameter.key];
    validateEffectParameter(parameter, value, "INVALID_DOCUMENT");
    if (parameter.kind === "color") {
      const color = parseColor(String(value));
      colors[parameter.key] = uniform(new Vector3(color.x, color.y, color.z));
    } else parameters[parameter.key] = uniform(numberValue(parameter, value));
  }
  return { parameters, colors };
}

export function updateParameterUniforms(controls: ParameterUniforms, effect: Effect): void {
  if (effect.type === "gradient") return;
  const settings = resolveEffectSettings(effect);
  for (const parameter of getEffectDefinition(effect.type).parameters.filter(scoped)) {
    const value = settings[parameter.key];
    validateEffectParameter(parameter, value, "INVALID_DOCUMENT");
    if (parameter.kind === "color") {
      const color = parseColor(String(value));
      controls.colors[parameter.key]!.value.set(color.x, color.y, color.z);
    } else controls.parameters[parameter.key]!.value = numberValue(parameter, value);
  }
}
