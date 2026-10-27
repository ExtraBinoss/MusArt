import { ensure } from "../../errors";
export const BLEND_MODES = [
  "normal",
  "darken",
  "multiply",
  "color-burn",
  "linear-burn",
  "lighten",
  "screen",
  "color-dodge",
  "linear-dodge",
  "overlay",
  "soft-light",
  "hard-light",
  "vivid-light",
  "linear-light",
  "pin-light",
  "hard-mix",
  "difference",
  "exclusion",
  "subtract",
  "divide",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];
export type BlendCategory =
  | "normal"
  | "darken"
  | "lighten"
  | "contrast"
  | "difference"
  | "component";
export interface BlendDefinition {
  readonly id: BlendMode;
  readonly nameKey: string;
  readonly category: BlendCategory;
}
const category = (mode: BlendMode): BlendCategory =>
  mode === "normal"
    ? "normal"
    : ["darken", "multiply", "color-burn", "linear-burn"].includes(mode)
      ? "darken"
      : ["lighten", "screen", "color-dodge", "linear-dodge"].includes(mode)
        ? "lighten"
        : [
              "overlay",
              "soft-light",
              "hard-light",
              "vivid-light",
              "linear-light",
              "pin-light",
              "hard-mix",
            ].includes(mode)
          ? "contrast"
          : ["difference", "exclusion", "subtract", "divide"].includes(mode)
            ? "difference"
            : "component";
export const BLEND_CATALOG: Readonly<Record<BlendMode, BlendDefinition>> = Object.freeze(
  Object.fromEntries(
    BLEND_MODES.map((id) => [
      id,
      Object.freeze({ id, nameKey: `blend.${id}`, category: category(id) }),
    ]),
  ) as Record<BlendMode, BlendDefinition>,
);
export function getBlendDefinition(mode: BlendMode): BlendDefinition {
  ensure(Object.hasOwn(BLEND_CATALOG, mode), "INVALID_COMMAND", "Unknown blend mode");
  return BLEND_CATALOG[mode];
}
