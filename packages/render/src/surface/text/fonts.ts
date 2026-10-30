import { FONT_CATALOG, MAX_FONT_FILE_BYTES } from "@musart/assets";
import { createOutlineFont, type OutlineFont, type OutlineGlyph } from "./outlines";
import { createShaper } from "./shaping";
export type { OutlineFont } from "./outlines";
export interface FontLease {
  readonly font: OutlineFont;
  release: () => void;
}
export type FontResolver = (
  family: string,
  weight: number,
  signal?: AbortSignal,
) => Promise<ArrayBuffer>;
export const MAX_FONT_BYTES = MAX_FONT_FILE_BYTES;
interface PreparedFont {
  font: OutlineFont;
  dispose: () => void;
}
interface FontEntry {
  key: string;
  promise: Promise<OutlineFont>;
  controller: AbortController;
  users: number;
  retired: boolean;
  cleared: boolean;
  disposed: boolean;
  value?: PreparedFont;
}
const families = new Map([
  ...FONT_CATALOG.flatMap(
    (font) =>
      [
        [font.family.toLowerCase(), font.id],
        [font.id, font.id],
      ] as const,
  ),
  ["inter variable", "inter"],
  ["space grotesk variable", "space-grotesk"],
  ["arial", "arimo"],
  ["sans-serif", "inter"],
  ["georgia", "tinos"],
  ["serif", "tinos"],
  ["monospace", "roboto-mono"],
]);
const CACHED_FONTS = 5;

/** Unknown legacy system families resolve to the bundled sans face, consistently offline. */
export function fontFamilyKey(family: string): string {
  return families.get(normalizeFontFamily(family)) ?? "inter";
}
/** Resource identity keeps imported/remote families distinct from the bundled fallback. */
export function normalizeFontFamily(family: string): string {
  return family.trim().replaceAll('"', "").replaceAll("'", "").replace(/\s+/g, " ").toLowerCase();
}
/** Five idle faces remain warm. Leases protect synchronous outline preparation from eviction. */
export class FontRepository {
  private readonly entries = new Map<string, FontEntry>();
  constructor(private readonly options: { resolver?: FontResolver } = {}) {}

  async acquire(family: string, weight = 400): Promise<FontLease> {
    if (!this.options.resolver && /^(custom|local):/.test(normalizeFontFamily(family)))
      throw new Error("This imported or system font requires a font resolver.");
    const face = fontFamilyKey(family),
      file = face === "tinos" && weight >= 600 ? "bold" : "font";
    const key = this.options.resolver
      ? JSON.stringify([normalizeFontFamily(family), weight])
      : `${face}/${file}`;
    const entry = this.entry(key, family, weight);
    entry.users++;
    this.touch(entry);
    let font: OutlineFont;
    try {
      font = await entry.promise;
    } catch (error) {
      this.release(entry);
      if (entry.cleared) throw new Error("Font request was cleared.", { cause: error });
      throw error;
    }
    if (entry.retired) {
      this.release(entry);
      throw new Error("Font request was cleared.");
    }
    let released = false;
    return {
      font,
      release: () => {
        if (released) return;
        released = true;
        this.release(entry);
      },
    };
  }
  private entry(key: string, family: string, weight: number): FontEntry {
    const cached = this.entries.get(key);
    if (cached) return cached;
    const controller = new AbortController();
    const entry: FontEntry = {
      key,
      controller,
      users: 0,
      retired: false,
      cleared: false,
      disposed: false,
      promise: this.prepare(key, family, weight, controller.signal).then(
        (value) => {
          entry.value = value;
          return value.font;
        },
        (error: unknown) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          entry.retired = true;
          throw error;
        },
      ),
    };
    this.entries.set(key, entry);
    return entry;
  }
  private async prepare(
    key: string,
    family: string,
    weight: number,
    signal: AbortSignal,
  ): Promise<PreparedFont> {
    let buffer: ArrayBuffer;
    if (this.options.resolver) buffer = await this.options.resolver(family, weight, signal);
    else {
      const response = await fetch(`/fonts/${key}.ttf`, { signal });
      if (!response.ok) throw new Error(`Unable to load font: ${family} (${response.status}).`);
      buffer = await response.arrayBuffer();
    }
    signal.throwIfAborted();
    if (buffer.byteLength > MAX_FONT_BYTES) throw new Error("Font exceeds the 32 MiB limit.");
    const { Font, Face, getGlyphDelta, getGlyphPath, getGlyphPathWithVariation } =
      await import("text-shaper");
    signal.throwIfAborted();
    // Own the lazy reader storage and normalize cross-realm platform ArrayBuffers.
    const native = Font.load(new Uint8Array(buffer).slice().buffer);
    const outlines = createOutlineFont(native, {
      Face,
      getGlyphDelta,
      getGlyphPath,
      getGlyphPathWithVariation,
    });
    let shaper: Awaited<ReturnType<typeof createShaper>>;
    try {
      shaper = await createShaper(native, (index) => outlines.font.glyphs.get(index));
    } catch (error) {
      outlines.dispose();
      throw error;
    }
    const dispose = () => {
      try {
        shaper.dispose();
      } finally {
        outlines.dispose();
      }
    };
    if (signal.aborted) {
      dispose();
      signal.throwIfAborted();
    }
    outlines.font.shape = (text, weight) => shaper.shape(text, weight);
    return { font: outlines.font, dispose };
  }
  private touch(entry: FontEntry): void {
    if (this.entries.get(entry.key) !== entry) return;
    this.entries.delete(entry.key);
    this.entries.set(entry.key, entry);
  }
  private release(entry: FontEntry): void {
    entry.users--;
    if (entry.retired) {
      if (entry.users === 0) this.destroy(entry);
      return;
    }
    this.touch(entry);
    const idle = [...this.entries.values()].filter((item) => item.value && item.users === 0);
    for (const oldest of idle.slice(0, Math.max(0, idle.length - CACHED_FONTS))) {
      this.entries.delete(oldest.key);
      oldest.retired = true;
      this.destroy(oldest);
    }
  }
  private destroy(entry: FontEntry): void {
    if (!entry.value || entry.disposed) return;
    entry.disposed = true;
    entry.value.dispose();
  }
  clear(): void {
    const entries = [...this.entries.values()];
    this.entries.clear();
    const failures: unknown[] = [];
    for (const entry of entries) {
      entry.retired = entry.cleared = true;
      entry.controller.abort();
      if (entry.users === 0) {
        try {
          this.destroy(entry);
        } catch (error) {
          failures.push(error);
        }
      }
    }
    if (failures.length) throw new AggregateError(failures, "Font cache cleanup failed.");
  }
}
export function weightedGlyph(
  font: OutlineFont,
  glyph: OutlineGlyph,
  weight: number,
): OutlineGlyph {
  return font.variation?.getTransform(glyph, { wght: weight, opsz: 14 }) ?? glyph;
}
