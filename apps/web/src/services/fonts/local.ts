import type { FontDefinition } from "@musart/assets";
import type { LocalFontData, LocalFontQuery } from "./model";
import { FontLibraryError, normalizeFamily } from "./validation";

function nativeQuery(): LocalFontQuery | undefined {
  const api = globalThis as typeof globalThis & { queryLocalFonts?: LocalFontQuery };
  return typeof api.queryLocalFonts === "function" ? api.queryLocalFonts.bind(api) : undefined;
}
/** Metadata discovery stays in the trigger gesture; font blobs are read only when requested. */
export class LocalFonts {
  private readonly query: LocalFontQuery | undefined;
  private readonly entries = new Map<string, LocalFontData>();
  private pending: Promise<readonly FontDefinition[]> | null = null;
  private result: readonly FontDefinition[] | null = null;
  private failure: unknown;
  private closed = false;
  constructor(query?: LocalFontQuery) {
    this.query = query ?? nativeQuery();
  }
  get supported(): boolean {
    return Boolean(this.query);
  }
  discover = (): Promise<readonly FontDefinition[]> => {
    if (this.closed)
      return Promise.reject(new FontLibraryError("disposed", "The font library is closed."));
    if (!this.query) return Promise.resolve([]);
    if (this.failure) return Promise.reject(this.failure);
    if (this.result) return Promise.resolve(this.result);
    if (this.pending) return this.pending;
    let native: ReturnType<LocalFontQuery>;
    try {
      native = this.query();
    } catch (error) {
      native = Promise.reject(error);
    }
    const pending = native.then(
      (fonts) => {
        if (this.closed) throw new FontLibraryError("disposed", "The font library is closed.");
        const definitions = new Map<string, FontDefinition>();
        for (const font of fonts) {
          if (!font.postscriptName.trim()) continue;
          const family = `local:${font.postscriptName.trim()}`;
          this.entries.set(normalizeFamily(family), font);
          definitions.set(normalizeFamily(family), {
            id: family,
            family,
            label: (font.fullName || font.family).slice(0, 200),
            category: /mono|code|console/i.test(font.family) ? "mono" : "sans",
            source: "local",
          });
        }
        this.result = [...definitions.values()];
        return this.result;
      },
      (error: unknown) => {
        if (this.closed) throw new FontLibraryError("disposed", "The font library is closed.");
        this.failure = new FontLibraryError(
          "permission",
          "System font access is unavailable or was declined.",
          error,
        );
        throw this.failure;
      },
    );
    this.pending = pending;
    void pending
      .finally(() => {
        if (this.pending === pending) this.pending = null;
      })
      .catch(() => undefined);
    return pending;
  };
  async blob(family: string): Promise<Blob> {
    if (this.closed) throw new FontLibraryError("disposed", "The font library is closed.");
    const font = this.entries.get(normalizeFamily(family));
    if (!font)
      throw new FontLibraryError(
        "notFound",
        "Open the font picker to grant access to this system font.",
      );
    const blob = await font.blob();
    if (this.closed) throw new FontLibraryError("disposed", "The font library is closed.");
    return blob;
  }
  dispose() {
    this.closed = true;
    this.entries.clear();
    this.result = null;
    this.pending = null;
  }
}
