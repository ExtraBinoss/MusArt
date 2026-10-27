import type { Composition, Guide } from "../document/model";
import type { Insets } from "./model";
import { createId, createPage } from "../document/factories";
import { ensure } from "../errors";
import { validateInsets } from "./validation";
import type { CompositionPreset } from "./preset-catalog";
export { SOCIAL_PRESETS } from "./preset-catalog";
export type { CompositionPreset, PresetBrand } from "./preset-catalog";
/** Editable page guides; only supplied insets are used, never implied platform guarantees. */
export function safeAreaGuides(
  width: number,
  height: number,
  insets: Insets,
  prefix = createId("safe"),
): Guide[] {
  ensure(
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0,
    "INVALID_COMMAND",
    "Invalid guide bounds",
  );
  validateInsets(insets, width, height);
  return [
    { id: `${prefix}-left`, axis: "x", position: insets.left },
    { id: `${prefix}-right`, axis: "x", position: width - insets.right },
    { id: `${prefix}-top`, axis: "y", position: insets.top },
    { id: `${prefix}-bottom`, axis: "y", position: height - insets.bottom },
  ];
}
export function pageFromPreset(
  preset: CompositionPreset,
  patch: Partial<Composition> = {},
): Composition {
  ensure(preset.width > 0 && preset.height > 0, "INVALID_COMMAND", "Invalid preset dimensions");
  const page = createPage({
    name: preset.name,
    width: preset.width,
    height: preset.height,
    ...patch,
  });
  if (preset.safeArea) {
    page.margins = patch.margins ?? { ...preset.safeArea };
    if (!patch.guides) page.guides = safeAreaGuides(page.width, page.height, page.margins);
  }
  return page;
}
