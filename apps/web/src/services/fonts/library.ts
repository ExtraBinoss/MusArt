import { FONT_CATALOG, loadFontCatalog, type FontDefinition } from "@musart/assets";
import type { FontLibraryPort, LocalFontQuery, StoredFontFace, StoredFontFile } from "./model";
import { FontStore } from "./database";
import { LocalFonts } from "./local";
import { abortable, downloadFont, readFontBlob, type FontFetcher } from "./download";
import { FontLibraryError, fontWeight, normalizeFamily, validateFontBytes } from "./validation";

interface InstalledFace {
  definition: FontDefinition;
  file: StoredFontFile;
}
export interface FontLibraryOptions {
  databaseName?: string;
  store?: FontStore;
  fetch?: FontFetcher;
  catalog?: () => Promise<readonly FontDefinition[]>;
  queryLocalFonts?: LocalFontQuery;
  persist?: () => Promise<boolean>;
  now?: () => string;
}
const aliases = new Map([
  ["arial", "arimo"],
  ["georgia", "tinos"],
  ["serif", "tinos"],
  ["sans-serif", "inter"],
  ["monospace", "roboto mono"],
  ["inter variable", "inter"],
  ["space grotesk variable", "space grotesk"],
]);
const familyKey = (family: string) =>
  aliases.get(normalizeFamily(family)) ?? normalizeFamily(family);
const minimal = (font: FontDefinition): FontDefinition => ({
  id: font.id,
  family: font.family,
  category: font.category,
  ...(font.label ? { label: font.label } : {}),
  ...(font.source ? { source: font.source } : {}),
  ...(font.licenseURL ? { licenseURL: font.licenseURL } : {}),
});
/** Global, durable font originals. React/project documents receive metadata and stable family IDs. */
export class FontLibrary implements FontLibraryPort {
  private readonly store: FontStore;
  private readonly local: LocalFonts;
  private readonly fetcher: FontFetcher;
  private readonly controller = new AbortController();
  private readonly pending = new Map<string, Promise<InstalledFace>>();
  private readonly listeners = new Set<() => void>();
  private catalogPending: Promise<readonly FontDefinition[]> | null = null;
  private closed = false;
  private persistRequested = false;
  constructor(private readonly options: FontLibraryOptions = {}) {
    this.store = options.store ?? new FontStore(options.databaseName, () => this.dispose());
    this.local = new LocalFonts(options.queryLocalFonts);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  private assertOpen() {
    if (this.closed) throw new FontLibraryError("disposed", "The font library is closed.");
  }
  get supportsLocalFonts(): boolean {
    return this.local.supported;
  }
  subscribe = (listener: () => void) => {
    this.assertOpen();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.assertOpen();
    for (const listener of this.listeners) listener();
  }
  catalog = async (): Promise<readonly FontDefinition[]> => {
    this.assertOpen();
    if (this.catalogPending) return this.catalogPending;
    const pending = (this.options.catalog ?? loadFontCatalog)().then((remote) => {
      this.assertOpen();
      const result = new Map<string, FontDefinition>();
      for (const font of [
        ...FONT_CATALOG.map((font) => ({ ...font, source: "bundled" as const })),
        ...remote,
      ])
        if (!result.has(familyKey(font.family))) result.set(familyKey(font.family), font);
      return [...result.values()];
    });
    this.catalogPending = pending;
    void pending.catch(() => {
      if (this.catalogPending === pending) this.catalogPending = null;
    });
    return pending;
  };
  installed = async (): Promise<readonly FontDefinition[]> => {
    this.assertOpen();
    const faces = await this.store.faces();
    this.assertOpen();
    return [...new Map(faces.map((face) => [face.definition.id, face.definition])).values()];
  };
  discoverLocal = (): Promise<readonly FontDefinition[]> => {
    this.assertOpen();
    return this.local.discover();
  };
  private requestPersistence() {
    if (this.persistRequested) return;
    this.persistRequested = true;
    const persist =
      this.options.persist ?? (() => navigator.storage?.persist?.() ?? Promise.resolve(false));
    try {
      void persist().catch(() => undefined);
    } catch {
      /* Persistence remains best-effort; committed data is already durable. */
    }
  }
  private obtain(family: string, weight: number): Promise<InstalledFace> {
    this.assertOpen();
    fontWeight(weight);
    const key = JSON.stringify([familyKey(family), weight]),
      existing = this.pending.get(key);
    if (existing) return existing;
    const pending = this.load(family, weight).finally(() => {
      if (this.pending.get(key) === pending) this.pending.delete(key);
    });
    this.pending.set(key, pending);
    return pending;
  }
  private async saved(face: StoredFontFace): Promise<InstalledFace> {
    const file = await this.store.file(face.sha256);
    this.assertOpen();
    if (!file) throw new FontLibraryError("notFound", "The installed font original is missing.");
    return { definition: face.definition, file };
  }
  private async load(family: string, weight: number): Promise<InstalledFace> {
    const key = familyKey(family),
      existing = await this.store.face(key, weight);
    this.assertOpen();
    if (existing) return this.saved(existing);
    if (key.startsWith("custom:") || key.startsWith("local:")) {
      const nearest = await this.store.face(key, weight, true);
      this.assertOpen();
      if (nearest) return this.saved(nearest);
      if (key.startsWith("custom:"))
        throw new FontLibraryError(
          "notFound",
          "This imported font is not installed on this device.",
        );
      const bytes = await readFontBlob(await this.local.blob(family));
      this.assertOpen();
      return this.saveCustom(bytes, family, weight);
    }
    const bundled = FONT_CATALOG.find((font) => familyKey(font.family) === key || font.id === key);
    const definition = bundled
      ? { ...bundled, source: "bundled" as const }
      : (await this.catalog()).find((font) => familyKey(font.family) === key);
    this.assertOpen();
    if (!definition) throw new FontLibraryError("notFound", `Font is unavailable: ${family}.`);
    const variants = definition.variants?.filter((variant) => variant.style === "normal");
    const variant = [...(variants?.length ? variants : (definition.variants ?? []))].sort(
      (a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight) || a.weight - b.weight,
    )[0];
    const url = bundled
      ? `/fonts/${bundled.id}/${bundled.id === "tinos" && weight >= 600 ? "bold" : "font"}.ttf`
      : variant?.url;
    if (!url)
      throw new FontLibraryError(
        "notFound",
        "No supported outline file is available for this font.",
      );
    const canonicalWeight = bundled
      ? bundled.id === "tinos" && weight >= 600
        ? 700
        : 400
      : variant!.weight;
    if (canonicalWeight !== weight) {
      const source = await this.obtain(family, canonicalWeight);
      this.assertOpen();
      const addedAt = (this.options.now ?? (() => new Date().toISOString()))();
      const changed = await this.store.save(source.file, [
        {
          family: key,
          weight,
          sha256: source.file.sha256,
          definition: minimal(source.definition),
          addedAt,
        },
      ]);
      this.assertOpen();
      if (changed) this.publish();
      return source;
    }
    const bytes = await downloadFont(url, this.fetcher, this.controller.signal);
    this.assertOpen();
    const validated = await validateFontBytes(bytes, definition.label ?? definition.family);
    this.assertOpen();
    const addedAt = (this.options.now ?? (() => new Date().toISOString()))();
    const file: StoredFontFile = {
      sha256: validated.sha256,
      blob: new Blob([bytes], { type: `font/${validated.format}` }),
      size: bytes.byteLength,
      addedAt,
    };
    const changed = await this.store.save(file, [
      { family: key, weight, sha256: file.sha256, definition: minimal(definition), addedAt },
    ]);
    this.assertOpen();
    if (changed) this.publish();
    return { definition, file };
  }
  private async saveCustom(
    bytes: ArrayBuffer,
    alias?: string,
    requestedWeight?: number,
  ): Promise<InstalledFace> {
    const validated = await validateFontBytes(bytes, "Imported font");
    this.assertOpen();
    const family = `custom:${validated.sha256}`;
    const definition: FontDefinition = {
      id: family,
      family,
      label: validated.label,
      category: validated.category,
      source: "user",
    };
    const addedAt = (this.options.now ?? (() => new Date().toISOString()))(),
      file: StoredFontFile = {
        sha256: validated.sha256,
        blob: new Blob([bytes], { type: `font/${validated.format}` }),
        size: bytes.byteLength,
        addedAt,
      };
    const face: StoredFontFace = {
      family,
      weight: validated.weight,
      sha256: file.sha256,
      definition,
      addedAt,
    };
    const faces = alias
      ? [face, { ...face, family: familyKey(alias), weight: requestedWeight ?? validated.weight }]
      : [face];
    const changed = await this.store.save(file, faces);
    this.assertOpen();
    if (changed) this.publish();
    return { definition, file };
  }
  install = async (font: FontDefinition, weight = 400): Promise<FontDefinition> => {
    this.assertOpen();
    const result = await this.obtain(font.family, weight);
    this.assertOpen();
    this.requestPersistence();
    return result.definition;
  };
  importFile = async (file: File): Promise<FontDefinition> => {
    this.assertOpen();
    if (!/\.(ttf|otf)$/i.test(file.name))
      throw new FontLibraryError("unsupported", "Choose a TTF or OTF font file.");
    const bytes = await readFontBlob(file);
    this.assertOpen();
    const result = await this.saveCustom(bytes);
    this.assertOpen();
    this.requestPersistence();
    return result.definition;
  };
  resolve = async (family: string, weight: number, signal?: AbortSignal): Promise<ArrayBuffer> => {
    this.assertOpen();
    signal?.throwIfAborted();
    const result = await abortable(this.obtain(family, weight), signal);
    this.assertOpen();
    signal?.throwIfAborted();
    const bytes = await result.file.blob.arrayBuffer();
    this.assertOpen();
    signal?.throwIfAborted();
    return bytes;
  };
  dispose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    this.local.dispose();
    this.store.dispose();
    this.pending.clear();
    this.listeners.clear();
    this.catalogPending = null;
  };
}
