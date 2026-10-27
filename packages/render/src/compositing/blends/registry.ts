import type { Node } from "three/webgpu";
import { Fn, If } from "three/tsl";
import * as dark from "./darken";
import * as light from "./lighten";
import * as contrast from "./contrast";
import * as diff from "./difference";
import * as hsl from "./hsl";
import type { BlendFunction, RGB } from "./types";
export const BLEND_FUNCTIONS: Readonly<Record<string, BlendFunction>> = Object.freeze({
  normal: (_b, s) => s,
  darken: dark.darken,
  multiply: dark.multiply,
  "color-burn": dark.colorBurn,
  "linear-burn": dark.linearBurn,
  lighten: light.lighten,
  screen: light.screen,
  "color-dodge": light.colorDodge,
  "linear-dodge": light.add,
  overlay: contrast.overlay,
  "soft-light": contrast.softLight,
  "hard-light": contrast.hardLight,
  "vivid-light": contrast.vividLight,
  "linear-light": contrast.linearLight,
  "pin-light": contrast.pinLight,
  "hard-mix": contrast.hardMix,
  difference: diff.difference,
  exclusion: diff.exclusion,
  subtract: diff.subtract,
  divide: diff.divide,
  hue: hsl.hue,
  saturation: hsl.saturationBlend,
  color: hsl.color,
  luminosity: hsl.luminosity,
});
export const GPU_BLEND_MODES = Object.freeze(Object.keys(BLEND_FUNCTIONS));
export function blendModeId(mode: string): number {
  const id = GPU_BLEND_MODES.indexOf(mode);
  if (id < 0) throw new Error(`Mode de fusion GPU inconnu : ${mode}`);
  return id;
}
/** Runtime uniform branches: changing modes never rebuilds the material or shader graph. */
export function blendRGB(backdrop: RGB, source: RGB, mode: Node<"float">): RGB {
  return Fn(() => {
    // Hoist sampled colors before runtime branches. Otherwise TSL may place a shared
    // texture temporary inside only the first branch that uses it.
    const b = backdrop.toVar();
    const s = source.toVar();
    const result = s.toVar();
    GPU_BLEND_MODES.forEach((name, index) => {
      if (index !== 0)
        If(mode.equal(index), () => {
          result.assign(BLEND_FUNCTIONS[name]!(b, s));
        });
    });
    return result;
  })();
}
