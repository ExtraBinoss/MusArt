import { freezeValue } from "../../document/immutable";
import { createEffect } from "../../document/factories";
import { TRANSITION_CATALOG } from "../../effects/transition/catalog";
import type { LayerMotionProperty } from "../properties/model";
import type { AnimationCategory, AnimationChannel, MotionAnimationPreset } from "./model";

const ease = { type: "cubicBezier", x1: 0.16, y1: 1, x2: 0.3, y2: 1 } as const;
const spring = { type: "spring", bounce: 0.35, response: 12 } as const;
function channel(
  property: LayerMotionProperty,
  values: number[],
  operation: AnimationChannel["operation"] = "add",
  unit?: AnimationChannel["unit"],
): AnimationChannel {
  return {
    target: { kind: "layer", property },
    operation,
    ...(unit ? { unit } : {}),
    points: values.map((value, index) => ({
      at: index / (values.length - 1),
      value,
      easing: ease,
    })),
  };
}
function effect(type: "blur" | "transition", patch: Parameters<typeof createEffect>[1] = {}) {
  const { id: _id, ...definition } = createEffect(type, { ...patch, id: "preset-effect" });
  return definition;
}
const blur = (values: number[]): AnimationChannel => ({
  target: { kind: "effect", slot: 0, property: "amount" },
  operation: "replace",
  points: values.map((value, index) => ({ at: index / (values.length - 1), value, easing: ease })),
});
const fade = () => channel("opacity", [0, 1], "multiply");
function preset(
  id: string,
  name: string,
  category: AnimationCategory,
  channels: AnimationChannel[],
  effects: MotionAnimationPreset["effects"] = [],
  duration = 600,
): MotionAnimationPreset {
  return { version: 1, id, name, category, duration, channels, effects };
}
const moves = [
  ["left", "Left", -1, 0],
  ["right", "Right", 1, 0],
  ["up", "Up", 0, -1],
  ["down", "Down", 0, 1],
  ["upper-left", "Upper left", -1, -1],
  ["upper-right", "Upper right", 1, -1],
  ["lower-left", "Lower left", -1, 1],
  ["lower-right", "Lower right", 1, 1],
] as const;
const recipes: MotionAnimationPreset[] = moves.map(([id, name, x, y]) =>
  preset(`move-${id}`, `Move · ${name}`, "move", [
    ...(x ? [channel("x", [x * 0.7, 0], "add", "width")] : []),
    ...(y ? [channel("y", [y * 0.7, 0], "add", "height")] : []),
    fade(),
  ]),
);
for (const [id, name, values] of [
  ["pop", "Pop", [0.05, 1.12, 1]],
  ["grow", "Grow", [0.4, 1]],
  ["shrink", "Shrink", [1.5, 1]],
  ["punch", "Punch", [1, 1.25, 1]],
  ["zoom-settle", "Zoom & settle", [0.7, 1.05, 1]],
  ["breathe", "Breathe", [1, 1.08, 1]],
] as const)
  recipes.push(
    preset(`scale-${id}`, name, "scale", [
      channel("scaleX", [...values], "multiply"),
      channel("scaleY", [...values], "multiply"),
    ]),
  );
recipes.push(
  preset("blur-focus", "Focus", "blur", [blur([1, 0])], [effect("blur", { amount: 0, scale: 16 })]),
);
recipes.push(
  preset(
    "blur-defocus",
    "Defocus",
    "blur",
    [blur([0, 1])],
    [effect("blur", { amount: 0, scale: 16 })],
  ),
);
for (const [id, name, x, y] of moves.slice(0, 4))
  recipes.push(
    preset(
      `blur-${id}`,
      `Blur · ${name}`,
      "blur",
      [
        blur([1, 0]),
        fade(),
        ...(x
          ? [channel("x", [x * 0.4, 0], "add", "width")]
          : [channel("y", [y * 0.4, 0], "add", "height")]),
      ],
      [effect("blur", { amount: 0, scale: 16 })],
    ),
  );
for (const [id, name, values] of [
  ["clockwise", "Clockwise", [-180, 0]],
  ["counterclockwise", "Counterclockwise", [180, 0]],
  ["tilt-left", "Tilt left", [-20, 0]],
  ["tilt-right", "Tilt right", [20, 0]],
  ["rock", "Rock", [0, -12, 12, -6, 0]],
  ["swing", "Swing", [-30, 15, -8, 0]],
] as const)
  recipes.push(preset(`rotate-${id}`, name, "rotate", [channel("rotation", [...values])]));
recipes.push(
  preset("attention-pulse", "Pulse", "attention", [
    channel("scaleX", [1, 1.15, 1], "multiply"),
    channel("scaleY", [1, 1.15, 1], "multiply"),
  ]),
  preset("attention-shake-x", "Shake horizontally", "attention", [
    channel("x", [0, -0.08, 0.08, -0.04, 0.04, 0], "add", "width"),
  ]),
  preset("attention-shake-y", "Shake vertically", "attention", [
    channel("y", [0, -0.08, 0.08, -0.04, 0.04, 0], "add", "height"),
  ]),
  preset("attention-bounce", "Bounce", "attention", [
    channel("y", [0, -0.2, 0, -0.08, 0], "add", "height"),
  ]),
  preset(
    "scale-blur",
    "Scale & focus",
    "blur",
    [
      channel("scaleX", [0.05, 1], "multiply"),
      channel("scaleY", [0.05, 1], "multiply"),
      blur([1, 0]),
    ],
    [effect("blur", { amount: 0, scale: 16 })],
    150,
  ),
);
for (const recipe of recipes.filter((recipe) => recipe.id === "scale-grow"))
  for (const item of recipe.channels) item.points[1]!.easing = spring;

/** Real native GPU operators plus authored property recipes, rather than aliases counted twice. */
export const MOTION_ANIMATION_PRESETS: readonly MotionAnimationPreset[] = freezeValue([
  ...recipes,
  ...TRANSITION_CATALOG.map((entry) =>
    preset(
      `reveal-${entry.id}`,
      entry.id
        .split("-")
        .map((word) => word[0]!.toUpperCase() + word.slice(1))
        .join(" "),
      entry.category === "distort" || entry.category === "stylize" ? "stylize" : "reveal",
      [
        {
          target: { kind: "effectSetting", slot: 0, property: "progress" },
          operation: "replace",
          points: [
            { at: 0, value: 0 },
            { at: 1, value: 1, easing: ease },
          ],
        },
      ],
      [
        effect("transition", {
          settings: {
            style: entry.id,
            progress: 1,
            direction: "left",
            softness: 0.02,
            strength: 1,
            detail: 8,
          },
        }),
      ],
    ),
  ),
]);
