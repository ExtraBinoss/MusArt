export const MAX_FONT_FILE_BYTES = 32 * 1024 * 1024;
export interface FontDefinition {
  readonly family: string;
  readonly id: string;
  readonly category: "sans" | "serif" | "mono" | "display" | "handwriting";
  readonly label?: string;
  readonly source?: "bundled" | "google" | "user" | "local";
  readonly variants?: readonly FontVariant[];
  readonly licenseURL?: string;
}
export interface FontVariant {
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly url: string;
  readonly bytes?: number;
}
/** Locally bundled outline faces; URL, license and checksums live in the web asset manifest. */
export const FONT_CATALOG: readonly FontDefinition[] = [
  { family: "Inter", id: "inter", category: "sans" },
  { family: "Space Grotesk", id: "space-grotesk", category: "sans" },
  { family: "Arimo", id: "arimo", category: "sans" },
  { family: "Tinos", id: "tinos", category: "serif" },
  { family: "Roboto Mono", id: "roboto-mono", category: "mono" },
  { family: "Manrope", id: "manrope", category: "sans" },
  { family: "DM Sans", id: "dm-sans", category: "sans" },
  { family: "Montserrat", id: "montserrat", category: "sans" },
  { family: "Outfit", id: "outfit", category: "sans" },
  { family: "Sora", id: "sora", category: "sans" },
  { family: "Lora", id: "lora", category: "serif" },
  { family: "Merriweather", id: "merriweather", category: "serif" },
  { family: "Playfair Display", id: "playfair-display", category: "serif" },
  { family: "Caveat", id: "caveat", category: "handwriting" },
  { family: "Bebas Neue", id: "bebas-neue", category: "display" },
  { family: "Oswald", id: "oswald", category: "display" },
  { family: "Archivo", id: "archivo", category: "sans" },
  { family: "Raleway", id: "raleway", category: "sans" },
  { family: "Source Sans 3", id: "source-sans-3", category: "sans" },
  { family: "Pacifico", id: "pacifico", category: "handwriting" },
];
