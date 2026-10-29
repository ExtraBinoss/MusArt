import { ensure } from "../../errors";
import type { MotionPropertyDescriptor, MotionPropertySchema, MotionValue } from "./model";

const paintColor = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|transparent)$/i;
const effectColor = /^#[\da-f]{6}$/i;

/** Shared by imported keys, commands and resolved base values; never coerces/clamps input. */
export function isValidMotionValue(
  descriptor: MotionPropertySchema,
  value: unknown,
): value is MotionValue {
  switch (descriptor.kind) {
    case "number":
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= descriptor.min &&
        value <= descriptor.max &&
        (descriptor.kind !== "integer" || Number.isInteger(value))
      );
    case "boolean":
      return typeof value === "boolean";
    case "color":
      return (
        typeof value === "string" &&
        (descriptor.format === "rgb" ? effectColor : paintColor).test(value)
      );
    case "choice":
      return typeof value === "string" && descriptor.options.includes(value);
    case "string":
      return (
        typeof value === "string" &&
        value.length >= descriptor.minLength &&
        value.length <= descriptor.maxLength
      );
  }
}

export function validateMotionValue(
  descriptor: MotionPropertyDescriptor,
  value: unknown,
): asserts value is MotionValue {
  ensure(isValidMotionValue(descriptor, value), "INVALID_COMMAND", "Invalid animation value.");
}
