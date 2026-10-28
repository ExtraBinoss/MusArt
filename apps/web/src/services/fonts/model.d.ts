import type { FontDefinition } from "@musart/assets";

/** User-wide library; binary fonts never enter React state or the project edit journal. */
export interface FontLibraryPort {
  catalog(this: void): Promise<readonly FontDefinition[]>;
  installed(this: void): Promise<readonly FontDefinition[]>;
  install(this: void, font: FontDefinition, weight?: number): Promise<FontDefinition>;
  importFile(this: void, file: File): Promise<FontDefinition>;
  resolve(this: void, family: string, weight: number, signal?: AbortSignal): Promise<ArrayBuffer>;
  discoverLocal(this: void): Promise<readonly FontDefinition[]>;
  readonly supportsLocalFonts: boolean;
  subscribe(this: void, listener: () => void): () => void;
  dispose(this: void): void;
}

export interface StoredFontFace {
  family: string;
  definition: FontDefinition;
  weight: number;
  sha256: string;
  addedAt: string;
}
export interface StoredFontFile {
  sha256: string;
  blob: Blob;
  size: number;
  addedAt: string;
}
export interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob: () => Promise<Blob>;
}
export type LocalFontQuery = () => Promise<readonly LocalFontData[]>;
