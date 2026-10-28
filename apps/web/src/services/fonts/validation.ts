import { MAX_FONT_FILE_BYTES, type FontDefinition } from "@musart/assets";

export class FontLibraryError extends Error {
  constructor(
    readonly code:
      | "disposed"
      | "tooLarge"
      | "invalid"
      | "unsupported"
      | "notFound"
      | "download"
      | "permission"
      | "conflict",
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "FontLibraryError";
  }
}
export function normalizeFamily(family: string): string {
  return family.trim().replaceAll('"', "").replaceAll("'", "").replace(/\s+/g, " ").toLowerCase();
}
export function fontWeight(weight: number): number {
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000)
    throw new FontLibraryError("invalid", "Invalid font weight.");
  return weight;
}
export async function validateFontBytes(bytes: ArrayBuffer, fallback: string) {
  if (bytes.byteLength > MAX_FONT_FILE_BYTES)
    throw new FontLibraryError("tooLarge", "Font exceeds the 32 MiB limit.");
  const signature = bytes.byteLength >= 12 ? new DataView(bytes).getUint32(0) : 0;
  if (signature !== 0x00010000 && signature !== 0x4f54544f)
    throw new FontLibraryError("unsupported", "Choose a TrueType TTF or OpenType OTF font.");
  try {
    const { parse } = await import("opentype.js"),
      font = parse(bytes);
    if (
      !Number.isFinite(font.unitsPerEm) ||
      font.unitsPerEm < 16 ||
      font.unitsPerEm > 16384 ||
      font.glyphs.length < 1
    )
      throw new Error("Invalid font metrics.");
    font.glyphs.get(0).getPath(0, 0, font.unitsPerEm);
    const label =
      Array.from(font.getEnglishName("fullName") || font.getEnglishName("fontFamily") || fallback)
        .filter((character) => {
          const code = character.codePointAt(0)!;
          return code >= 32 && code !== 127;
        })
        .join("")
        .trim()
        .slice(0, 200) || "Imported font";
    const familyClass = Number(font.tables.os2?.sFamilyClass ?? 0) >> 8;
    const category: FontDefinition["category"] = font.tables.post?.isFixedPitch
      ? "mono"
      : familyClass >= 1 && familyClass <= 7
        ? "serif"
        : familyClass === 10
          ? "handwriting"
          : "sans";
    const weight = Math.max(1, Math.min(1000, Number(font.tables.os2?.usWeightClass ?? 400)));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return { label, category, weight, sha256, format: signature === 0x4f54544f ? "otf" : "ttf" };
  } catch (error) {
    throw new FontLibraryError(
      "invalid",
      "The font contains invalid or unsupported outline data.",
      error,
    );
  }
}
