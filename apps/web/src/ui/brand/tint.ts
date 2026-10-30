import { brand } from "./config";
import { mixHex } from "./engine/skins";

/** Shared sRGB stops for the retained mascot and generated browser/install icons. */
export const mascotTint = Object.freeze([
  { offset: "0%", color: mixHex(brand.colors.primary, "#FFFFFF", 0.22) },
  { offset: "48%", color: brand.colors.primary },
  { offset: "100%", color: mixHex(brand.colors.primary, brand.colors.ink, 0.16) },
]);
