import type { EffectType } from "@musart/core";
import { asciiNode } from "./ascii/node";
import { blurNode } from "./blur/node";
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
/** Renderer implementation registry. Metadata/defaults live in the pure core catalogue. */
export const EFFECT_NODES: Readonly<Record<Exclude<EffectType, "gradient">, EffectNodeBuilder>> =
  Object.freeze({
    dither: ditherNode,
    ascii: asciiNode,
    brightness: brightnessNode,
    contrast: contrastNode,
    grayscale: grayscaleNode,
    blur: blurNode,
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
  });
