import { ensure } from "../errors";
import {
  assertRecord,
  assertNumber,
  assertBoolean,
  assertList,
  assertUniqueId,
} from "../document/guards";
export function validateInsets(value: unknown, width: number, height: number): void {
  assertRecord(value);
  for (const side of ["top", "right", "bottom", "left"]) assertNumber(value[side], 0, 1_000_000);
  ensure(
    Number(value.left) + Number(value.right) <= width &&
      Number(value.top) + Number(value.bottom) <= height,
    "INVALID_DOCUMENT",
    "Insets exceed their bounds",
  );
}
export function validateLayerLayout(layer: Record<string, unknown>, ids: Set<string>): void {
  for (const key of ["margin", "padding"])
    if (layer[key] !== undefined)
      validateInsets(layer[key], Number(layer.width), Number(layer.height));
  if (layer.guides !== undefined) {
    assertList(layer.guides, 1000);
    for (const guide of layer.guides) {
      assertRecord(guide);
      assertUniqueId(guide.id, ids);
      ensure(guide.axis === "x" || guide.axis === "y", "INVALID_DOCUMENT", "Invalid guide axis");
      assertNumber(
        guide.position,
        0,
        guide.axis === "x" ? Number(layer.width) : Number(layer.height),
      );
    }
  }
}
export function validatePageLayout(page: Record<string, unknown>): void {
  if (page.margins !== undefined)
    validateInsets(page.margins, Number(page.width), Number(page.height));
  if (page.rulers !== undefined) assertBoolean(page.rulers);
  if (page.colorSpace !== undefined)
    ensure(
      typeof page.colorSpace === "string" &&
        ["srgb", "display-p3", "cmyk-proof"].includes(page.colorSpace),
      "INVALID_DOCUMENT",
      "Unknown working color space",
    );
}
