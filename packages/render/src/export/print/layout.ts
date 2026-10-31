import type { Composition } from "@musart/core";
import type { PrintExportOptions } from "./model";

export const DEFAULT_PRINT: Readonly<PrintExportOptions> = Object.freeze({
  dpi: 300,
  bleedMm: 0,
  cropMarks: false,
  registrationMarks: false,
  colorBars: false,
  pageInfo: false,
});
export function validatePrint(options: PrintExportOptions) {
  if (
    !Number.isFinite(options.dpi) ||
    options.dpi < 72 ||
    options.dpi > 1200 ||
    !Number.isFinite(options.bleedMm) ||
    options.bleedMm < 0 ||
    options.bleedMm > 25 ||
    [options.cropMarks, options.registrationMarks, options.colorBars, options.pageInfo].some(
      (value) => typeof value !== "boolean",
    )
  )
    throw new Error("Invalid print settings.");
}
/** Bleed extends the actual composition instead of enlarging or mirroring its edge pixels. */
export function printComposition(page: Composition, options: PrintExportOptions): Composition {
  validatePrint(options);
  const bleed = Math.ceil((options.bleedMm * options.dpi) / 25.4);
  return {
    ...page,
    width: page.width + 2 * bleed,
    height: page.height + 2 * bleed,
    layers: page.layers.map((layer) =>
      layer.parentId ? layer : { ...layer, x: layer.x + bleed, y: layer.y + bleed },
    ),
  };
}
