import { ensure } from "../errors";
import {
  assertRecord,
  assertText,
  assertNumber,
  assertBoolean,
  assertColor,
  assertList,
} from "../document/guards";
const pathPattern = /^[MmZzLlHhVvCcSsQqTtAa\dEe+.,\s-]+$/;
function path(value: unknown): void {
  assertText(value, 2_000_000);
  ensure(
    /^[Mm]/.test(value.trim()) && pathPattern.test(value),
    "INVALID_DOCUMENT",
    "Invalid vector path",
  );
}
function paint(value: unknown): void {
  if (value !== "none" && value !== "currentColor") assertColor(value);
}
export function validateVector(value: unknown): void {
  assertRecord(value);
  assertText(value.viewBox, 256);
  const box = value.viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  ensure(
    box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0,
    "INVALID_DOCUMENT",
    "Invalid vector viewBox",
  );
  ensure(
    typeof value.path === "string" || Array.isArray(value.parts),
    "INVALID_DOCUMENT",
    "Vector geometry is missing",
  );
  if (value.path !== undefined) path(value.path);
  if (value.parts !== undefined) {
    assertList(value.parts, 10000);
    ensure(value.parts.length > 0, "INVALID_DOCUMENT", "Empty vector parts");
    for (const part of value.parts) {
      assertRecord(part);
      path(part.path);
      if (part.fill !== undefined) paint(part.fill);
      if (part.stroke !== undefined) paint(part.stroke);
      if (part.strokeWidth !== undefined) assertNumber(part.strokeWidth, 0, 32768);
      if (part.opacity !== undefined) assertNumber(part.opacity, 0, 1);
      for (const [key, allowed] of [
        ["fillRule", ["nonzero", "evenodd"]],
        ["linecap", ["butt", "round", "square"]],
        ["linejoin", ["miter", "round", "bevel"]],
      ] as const)
        if (part[key] !== undefined)
          ensure(
            (allowed as readonly unknown[]).includes(part[key]),
            "INVALID_DOCUMENT",
            "Invalid vector stroke or fill style",
          );
      if (part.matrix !== undefined) {
        assertList(part.matrix, 6);
        ensure(part.matrix.length === 6, "INVALID_DOCUMENT", "Invalid vector matrix");
        for (const number of part.matrix) assertNumber(number, -1_000_000, 1_000_000);
      }
    }
  }
  if (value.strokeOnly !== undefined) assertBoolean(value.strokeOnly);
  if (value.preserveColors !== undefined) assertBoolean(value.preserveColors);
  if (value.attribution !== undefined) assertText(value.attribution, 10000);
}
