import type { EffectType } from "@musart/core";
import { asciiNode } from "./ascii/node";
import { blurNode } from "./blur/node";
import { brightnessNode } from "./brightness/node";
import { contrastNode } from "./contrast/node";
import { ditherNode } from "./dither/node";
import { grayscaleNode } from "./grayscale/node";
import type { EffectNodeBuilder } from "./shared/context";

/** Renderer implementation registry. Metadata/defaults live in the pure core catalogue. */
export const EFFECT_NODES: Readonly<Record<EffectType, EffectNodeBuilder>> = Object.freeze({
  dither: ditherNode,
  ascii: asciiNode,
  brightness: brightnessNode,
  contrast: contrastNode,
  grayscale: grayscaleNode,
  blur: blurNode,
});
