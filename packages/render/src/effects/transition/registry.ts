import type { TransitionStyle } from "@musart/core";
import { fade, fadeBlack, fadeWhite } from "./fade";
import { diamond, diagonalWipe, iris, radialWipe, wipe } from "./reveal";
import { blinds, checkerboard, dissolve, gridReveal, luma } from "./patterns";
import { doorway, flip, slide, spin, squeeze, zoom } from "./move";
import { kaleidoscope, ripple, swirl, wave } from "./distort";
import { defocus, glitch, halftone, ink, mosaic, pixelate, rgbSplit } from "./stylize";
import type { TransitionOperator } from "./shared";

/** JavaScript chooses one operator before graph construction; shaders never dispatch 30 branches. */
export const TRANSITION_OPERATORS: Readonly<Record<TransitionStyle, TransitionOperator>> =
  Object.freeze({
    fade,
    "fade-black": fadeBlack,
    "fade-white": fadeWhite,
    wipe,
    "diagonal-wipe": diagonalWipe,
    "radial-wipe": radialWipe,
    iris,
    diamond,
    blinds,
    checkerboard,
    "grid-reveal": gridReveal,
    luma,
    dissolve,
    slide,
    zoom,
    spin,
    flip,
    doorway,
    swirl,
    ripple,
    wave,
    squeeze,
    kaleidoscope,
    pixelate,
    defocus,
    "rgb-split": rgbSplit,
    glitch,
    ink,
    halftone,
    mosaic,
  });
