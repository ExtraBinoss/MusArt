import { ensure } from "../errors";
import type { EffectType } from "../document/model";

export type {
  NumberEffectParameter,
  BooleanEffectParameter,
  ChoiceEffectParameter,
  ColorEffectParameter,
  EffectParameter,
  EffectDefinition,
} from "./definition";
import { defineEffect, AMOUNT, SCALE, LEVELS, COLOR, SEED } from "./definition";
import type { EffectDefinition } from "./definition";
import { GRADIENT_DEFINITION } from "./gradient/definition";
import { RIPPLE_DEFINITION } from "./ripple/definition";
import { SHATTER_DEFINITION } from "./shatter/definition";
import { FLASHLIGHT_DEFINITION } from "./flashlight/definition";
import { NOISE_DEFINITION } from "./noise/definition";
import { CIRCLE_DEFINITION } from "./circle/definition";
import { CYANOTYPE_DEFINITION } from "./cyanotype/definition";
import { CRT_DEFINITION } from "./crt/definition";
import { DATAMOSH_DEFINITION } from "./datamosh/definition";
import { BIT_DITHER_DEFINITION } from "./bit-dither/definition";
import { RECEIPT_DEFINITION } from "./receipt/definition";
import { PINK_PHOSPHOR_DEFINITION } from "./pink-phosphor/definition";
import { TRANSITION_DEFINITION } from "./transition/definition";
import { BLUR_DEFINITION } from "./blur/definition";
import { SHADOW_DEFINITION } from "./shadow/definition";
import { MORPH_DEFINITION } from "./morph/definition";
/** Portable effect metadata shared by factories, validation and client controls. */
export const EFFECT_CATALOG: Readonly<Record<EffectType, EffectDefinition>> = Object.freeze({
  morph: MORPH_DEFINITION,
  dither: defineEffect("dither", {}, [AMOUNT, SCALE, LEVELS, COLOR, SEED]),
  ascii: defineEffect("ascii", { scale: 10, levels: 10, color: true }, [AMOUNT, SCALE, COLOR]),
  brightness: defineEffect("brightness", { amount: 0.5 }, [AMOUNT], "adjustment"),
  contrast: defineEffect("contrast", { amount: 0.5 }, [AMOUNT], "adjustment"),
  grayscale: defineEffect("grayscale", {}, [AMOUNT], "adjustment"),
  blur: BLUR_DEFINITION,
  shadow: SHADOW_DEFINITION,
  saturation: defineEffect("saturation", { amount: 0.5 }, [AMOUNT], "adjustment"),
  hue: defineEffect("hue", { amount: 0.5 }, [AMOUNT], "adjustment"),
  exposure: defineEffect("exposure", { amount: 0.5 }, [AMOUNT], "adjustment"),
  vibrance: defineEffect("vibrance", { amount: 0.5 }, [AMOUNT], "adjustment"),
  temperature: defineEffect("temperature", { amount: 0.5 }, [AMOUNT], "adjustment"),
  tint: defineEffect("tint", { amount: 0.5 }, [AMOUNT], "adjustment"),
  gamma: defineEffect("gamma", { amount: 0.5 }, [AMOUNT], "adjustment"),
  invert: defineEffect("invert", {}, [AMOUNT], "adjustment"),
  sepia: defineEffect("sepia", {}, [AMOUNT], "adjustment"),
  threshold: defineEffect("threshold", { amount: 0.5 }, [AMOUNT], "adjustment"),
  posterize: defineEffect("posterize", { levels: 6 }, [AMOUNT, LEVELS], "adjustment"),
  grain: defineEffect("grain", { amount: 0.2, scale: 1 }, [AMOUNT, SCALE, COLOR, SEED]),
  halftone: defineEffect("halftone", { scale: 8 }, [AMOUNT, SCALE, COLOR]),
  vignette: defineEffect("vignette", { amount: 0.5, scale: 2 }, [
    AMOUNT,
    { ...SCALE, labelKey: "effectControls:falloff", unit: "×" },
  ]),
  gradient: GRADIENT_DEFINITION,
  ripple: RIPPLE_DEFINITION,
  shatter: SHATTER_DEFINITION,
  noise: NOISE_DEFINITION,
  flashlight: FLASHLIGHT_DEFINITION,
  circle: CIRCLE_DEFINITION,
  cyanotype: CYANOTYPE_DEFINITION,
  datamosh: DATAMOSH_DEFINITION,
  crt: CRT_DEFINITION,
  "bit-dither": BIT_DITHER_DEFINITION,
  receipt: RECEIPT_DEFINITION,
  "pink-phosphor": PINK_PHOSPHOR_DEFINITION,
  transition: TRANSITION_DEFINITION,
});

export function getEffectDefinition(type: EffectType): EffectDefinition {
  ensure(Object.hasOwn(EFFECT_CATALOG, type), "INVALID_COMMAND", "Effet inconnu");
  return EFFECT_CATALOG[type];
}
