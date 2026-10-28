import { FONT_CATALOG } from "@musart/assets";

export type FontOption = (typeof FONT_CATALOG)[number];
const aliases: Readonly<Record<string, string>> = {
  arial: "arimo",
  georgia: "tinos",
  monospace: "roboto mono",
  "sans-serif": "inter",
  serif: "tinos",
  "inter variable": "inter",
  "space grotesk variable": "space grotesk",
};
const RECENT_KEY = "musart.fonts.recent";

export function findFont(
  family: string,
  catalog: readonly FontOption[] = FONT_CATALOG,
): FontOption | undefined {
  const key = family
      .trim()
      .replaceAll('"', "")
      .replaceAll("'", "")
      .replace(/\s+/g, " ")
      .toLowerCase(),
    name = aliases[key] ?? key;
  return catalog.find((font) => font.family.toLowerCase() === name || font.id === name);
}

export function resolveFont(
  family: string,
  catalog: readonly FontOption[] = FONT_CATALOG,
): FontOption {
  return findFont(family, catalog) ?? FONT_CATALOG[0]!;
}

/** Only the five most recent explicit choices are presentation preferences. */
export function readRecentFonts(catalog: readonly FontOption[] = FONT_CATALOG): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw || raw.length > 4096) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const knownIds = new Set(catalog.map((font) => font.id));
    return [
      ...new Set(value.filter((id): id is string => typeof id === "string" && knownIds.has(id))),
    ].slice(0, 5);
  } catch {
    return [];
  }
}

export function rememberFont(
  id: string,
  previous: readonly string[],
  catalog: readonly FontOption[] = FONT_CATALOG,
): string[] {
  const knownIds = new Set(catalog.map((font) => font.id));
  const recent = [...new Set([id, ...previous])].filter((item) => knownIds.has(item)).slice(0, 5);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // The current session keeps its recent choices when storage is unavailable.
  }
  return recent;
}
