/** Portable operator identities; implementations belong to packages/render. */
export type TransitionCategory = "fade" | "reveal" | "move" | "distort" | "stylize";
export type TransitionStyle =
  | "fade"
  | "fade-black"
  | "fade-white"
  | "wipe"
  | "diagonal-wipe"
  | "radial-wipe"
  | "iris"
  | "diamond"
  | "blinds"
  | "checkerboard"
  | "grid-reveal"
  | "luma"
  | "dissolve"
  | "slide"
  | "zoom"
  | "spin"
  | "flip"
  | "doorway"
  | "swirl"
  | "ripple"
  | "wave"
  | "squeeze"
  | "kaleidoscope"
  | "pixelate"
  | "defocus"
  | "rgb-split"
  | "glitch"
  | "ink"
  | "halftone"
  | "mosaic";
export interface TransitionDefinition {
  readonly id: TransitionStyle;
  readonly category: TransitionCategory;
  readonly labelKey: string;
}
const families: Readonly<Record<TransitionCategory, readonly TransitionStyle[]>> = {
  fade: ["fade", "fade-black", "fade-white"],
  reveal: [
    "wipe",
    "diagonal-wipe",
    "radial-wipe",
    "iris",
    "diamond",
    "blinds",
    "checkerboard",
    "grid-reveal",
    "luma",
    "dissolve",
  ],
  move: ["slide", "zoom", "spin", "flip", "doorway"],
  distort: ["swirl", "ripple", "wave", "squeeze", "kaleidoscope"],
  stylize: ["pixelate", "defocus", "rgb-split", "glitch", "ink", "halftone", "mosaic"],
};
export const TRANSITION_CATEGORIES: readonly TransitionCategory[] = Object.freeze(
  Object.keys(families) as TransitionCategory[],
);
export const TRANSITION_CATALOG: readonly TransitionDefinition[] = Object.freeze(
  TRANSITION_CATEGORIES.flatMap((category) =>
    families[category].map((id) =>
      Object.freeze({ id, category, labelKey: `transitions:style.${id}` }),
    ),
  ),
);
const byId = new Map(TRANSITION_CATALOG.map((entry) => [entry.id, entry]));
export function getTransitionDefinition(style: unknown): TransitionDefinition | undefined {
  return typeof style === "string" ? byId.get(style as TransitionStyle) : undefined;
}
