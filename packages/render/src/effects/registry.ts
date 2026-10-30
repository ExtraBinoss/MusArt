import type { EffectType } from "@musart/core";
import { asciiNode } from "./ascii/node";
import { blurNode } from "./blur/node";
import { shadowNode } from "./shadow/node";
import { brightnessNode } from "./brightness/node";
import { contrastNode } from "./contrast/node";
import { ditherNode } from "./dither/node";
import { grayscaleNode } from "./grayscale/node";
import type { EffectNodeBuilder } from "./shared/context";

import { exposureNode } from "./exposure/node";
import { saturationNode } from "./saturation/node";
import { hueNode } from "./hue/node";
import { vibranceNode } from "./vibrance/node";
import { temperatureNode } from "./temperature/node";
import { tintNode } from "./tint/node";
import { gammaNode } from "./gamma/node";
import { invertNode } from "./invert/node";
import { sepiaNode } from "./sepia/node";
import { thresholdNode } from "./threshold/node";
import { posterizeNode } from "./posterize/node";
import { grainNode } from "./grain/node";
import { halftoneNode } from "./halftone/node";
import { vignetteNode } from "./vignette/node";
import { rippleNode } from "./ripple/node";
import { shatterNode } from "./shatter/node";
import { noiseNode } from "./noise/node";
import { flashlightNode } from "./flashlight/node";
import { circleNode } from "./circle/node";
import { cyanotypeNode } from "./cyanotype/node";
import { crtNode } from "./crt/node";
import { datamoshNode } from "./datamosh/node";
import { bitDitherNode } from "./bit-dither/node";
import { receiptNode } from "./receipt/node";
import { pinkPhosphorNode } from "./pink-phosphor/node";
/** Renderer implementation registry. Metadata/defaults live in the pure core catalogue. */
export const EFFECT_NODES: Readonly<
  Record<Exclude<EffectType, "gradient" | "transition">, EffectNodeBuilder>
> = Object.freeze({
  dither: ditherNode,
  ascii: asciiNode,
  brightness: brightnessNode,
  contrast: contrastNode,
  grayscale: grayscaleNode,
  blur: blurNode,
  shadow: shadowNode,
  exposure: exposureNode,
  saturation: saturationNode,
  hue: hueNode,
  vibrance: vibranceNode,
  temperature: temperatureNode,
  tint: tintNode,
  gamma: gammaNode,
  invert: invertNode,
  sepia: sepiaNode,
  threshold: thresholdNode,
  posterize: posterizeNode,
  grain: grainNode,
  halftone: halftoneNode,
  vignette: vignetteNode,
  ripple: rippleNode,
  shatter: shatterNode,
  noise: noiseNode,
  flashlight: flashlightNode,
  circle: circleNode,
  cyanotype: cyanotypeNode,
  datamosh: datamoshNode,
  crt: crtNode,
  "bit-dither": bitDitherNode,
  receipt: receiptNode,
  "pink-phosphor": pinkPhosphorNode,
});
