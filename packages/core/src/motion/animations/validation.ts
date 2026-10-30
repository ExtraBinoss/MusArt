import { assertList, assertNumber, assertRecord, assertUniqueId } from "../../document/guards";
import { createLayer } from "../../document/factories";
import { validateEffect } from "../../document/validation";
import { ensure } from "../../errors";
import type { Layer } from "../../document/model";
import { validateMotionEasing } from "../easing";
import { resolveLayerMotionProperty, validateMotionValue } from "../properties/registry";
import { validateMotionTime } from "../time";
import type { MotionAnimation, MotionAnimationPreset } from "./model";
import { animationTarget } from "./targets";

export const ANIMATION_CATEGORIES = [
  "typography",
  "move",
  "scale",
  "rotate",
  "blur",
  "attention",
  "reveal",
  "stylize",
  "custom",
] as const;

/** Validate portable recipes before storage, import, compilation or application. No executable data. */
export function validateMotionAnimationPreset(
  value: unknown,
): asserts value is MotionAnimationPreset {
  assertRecord(value);
  ensure(
    value.version === 1 &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      value.id.length <= 200,
    "INVALID_DOCUMENT",
    "Invalid animation preset identity",
  );
  ensure(
    typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 100,
    "INVALID_DOCUMENT",
    "Invalid animation name",
  );
  ensure(
    ANIMATION_CATEGORIES.some((category) => category === value.category),
    "INVALID_DOCUMENT",
    "Unknown animation category",
  );
  assertNumber(value.duration, 1, 3600000);
  assertList(value.effects, 32);
  assertList(value.channels, 64);
  ensure(value.channels.length > 0, "INVALID_DOCUMENT", "Animation has no channels");
  const effects = value.effects.map((effect, index) => {
    assertRecord(effect);
    ensure(!("id" in effect), "INVALID_DOCUMENT", "Preset effect identities must be local");
    return { ...effect, id: `animation-effect-${index}` };
  });
  const subject = createLayer("rectangle", {
    id: "animation-subject",
    effects: effects as Layer["effects"],
    fillGradient: {
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#000000" },
        { offset: 1, color: "#ffffff" },
      ],
    },
  });
  for (const effect of subject.effects) validateEffect(effect, new Set());
  const animation = { effectIds: effects.map((effect) => effect.id) };
  const addresses = new Set<string>();
  for (const channel of value.channels) {
    assertRecord(channel);
    assertRecord(channel.target);
    ensure(
      ["add", "multiply", "replace"].includes(String(channel.operation)),
      "INVALID_DOCUMENT",
      "Invalid animation operation",
    );
    ensure(
      channel.unit === undefined || channel.unit === "width" || channel.unit === "height",
      "INVALID_DOCUMENT",
      "Invalid animation distance unit",
    );
    const target = channel.target;
    ensure(
      target.kind === "layer" || target.kind === "effect" || target.kind === "effectSetting",
      "INVALID_DOCUMENT",
      "Invalid animation target",
    );
    ensure(
      Object.keys(target).every((key) =>
        ["kind", "property", ...(target.kind === "layer" ? [] : ["slot"])].includes(key),
      ),
      "INVALID_DOCUMENT",
      "Unexpected animation target field",
    );
    if (target.kind !== "layer") assertNumber(target.slot, 0, effects.length - 1);
    if (target.kind !== "layer")
      ensure(Number.isInteger(target.slot), "INVALID_DOCUMENT", "Invalid effect slot");
    const typed = channel as unknown as MotionAnimationPreset["channels"][number];
    const descriptor = resolveLayerMotionProperty(
      subject,
      animationTarget(subject.id, animation, typed.target),
    );
    // Text channels are validated against a real text subject instead of rejecting reusable text presets.
    const resolved =
      descriptor ??
      resolveLayerMotionProperty(
        { ...subject, kind: "text" },
        animationTarget(subject.id, animation, typed.target),
      );
    ensure(resolved, "INVALID_DOCUMENT", "Unavailable animation property");
    const address = JSON.stringify(target);
    ensure(!addresses.has(address), "INVALID_DOCUMENT", "Duplicate animation channel");
    addresses.add(address);
    assertList(channel.points, 256);
    ensure(channel.points.length >= 2, "INVALID_DOCUMENT", "Animation needs at least two points");
    let previous = -1;
    for (const point of channel.points) {
      assertRecord(point);
      assertNumber(point.at, 0, 1);
      ensure(point.at > previous, "INVALID_DOCUMENT", "Unordered animation points");
      previous = point.at;
      if (channel.operation === "replace" && !channel.unit)
        validateMotionValue(resolved, point.value);
      else {
        ensure(
          resolved.kind === "number" || resolved.kind === "integer",
          "INVALID_DOCUMENT",
          "Relative animation requires numbers",
        );
        assertNumber(point.value, -1000000, 1000000);
      }
      if (point.easing !== undefined) validateMotionEasing(point.easing);
    }
    ensure(
      typed.points[0]!.at === 0 && typed.points[typed.points.length - 1]!.at === 1,
      "INVALID_DOCUMENT",
      "Animation endpoints must span zero to one",
    );
  }
}

export function validateMotionAnimations(value: unknown, layer: Layer, ids: Set<string>): number {
  if (value === undefined) return 0;
  let count = 0;
  assertList(value, 128);
  for (const animation of value) {
    assertRecord(animation);
    assertUniqueId(animation.id, ids);
    validateMotionAnimationPreset(animation.preset);
    validateMotionTime(animation.start);
    validateMotionTime(animation.duration);
    ensure(
      animation.start.value >= 0 &&
        animation.duration.value > 0 &&
        typeof animation.enabled === "boolean",
      "INVALID_DOCUMENT",
      "Invalid animation interval",
    );
    assertNumber(animation.strength, 0, 10);
    assertList(animation.effectIds, 32);
    ensure(
      animation.effectIds.length === animation.preset.effects.length &&
        new Set(animation.effectIds).size === animation.effectIds.length,
      "INVALID_DOCUMENT",
      "Invalid animation effects",
    );
    for (const channel of animation.preset.channels) {
      count += channel.points.length;
      const target = animationTarget(
        layer.id,
        animation as unknown as MotionAnimation,
        channel.target,
      );
      ensure(
        resolveLayerMotionProperty(layer, target),
        "INVALID_DOCUMENT",
        "Missing animation target",
      );
    }
  }
  return count;
}
