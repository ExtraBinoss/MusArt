import { Blob as NativeBlob, File as NativeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { deleteDB, openDB } from "idb";
import { vi } from "vitest";
import { outlineFont } from "../../../../../packages/render/test/text-fixture";
import { FontLibrary } from "../../../src/services/fonts/library";
import { FontStore } from "../../../src/services/fonts/database";
import type { StoredFontFace, StoredFontFile } from "../../../src/services/fonts/model";

const names: string[] = [],
  close: (() => void)[] = [];
export function platform() {
  vi.stubGlobal("Blob", NativeBlob);
  vi.stubGlobal("File", NativeFile);
  vi.stubGlobal("crypto", webcrypto);
}
export function name() {
  const value = `font-tests-${crypto.randomUUID()}`;
  names.push(value);
  return value;
}
const outlineBytes = outlineFont().toArrayBuffer();
export function bytes() {
  return outlineBytes.slice(0);
}
export function fontFile(filename = "example.otf") {
  return new File([bytes()], filename, { type: "font/otf" });
}
export function library(options: ConstructorParameters<typeof FontLibrary>[0] = {}) {
  const databaseName = options?.databaseName ?? name(),
    fetcher = vi.fn(async () => new Response(new Uint8Array(bytes()))),
    persist = vi.fn(async () => true);
  const library = new FontLibrary({
    databaseName,
    fetch: fetcher,
    catalog: async () => [],
    persist,
    ...options,
  });
  close.push(library.dispose);
  return { library, fetcher, persist, databaseName };
}
export function store(databaseName = name()) {
  const store = new FontStore(databaseName);
  close.push(() => store.dispose());
  return { store, databaseName };
}
export function record(sha256 = "a".repeat(64), family = "example", weight = 400) {
  const addedAt = "2026-10-27T00:00:00.000Z",
    data = bytes();
  const file: StoredFontFile = { sha256, blob: new Blob([data]), size: data.byteLength, addedAt };
  const face: StoredFontFace = {
    family,
    weight,
    sha256,
    addedAt,
    definition: { id: family, family, category: "sans", source: "user" },
  };
  return { file, face };
}
export async function count(databaseName: string, storeName: "fontFiles" | "fontFaces") {
  if (!(await indexedDB.databases()).some((database) => database.name === databaseName)) return 0;
  const db = await openDB(databaseName);
  try {
    return db.objectStoreNames.contains(storeName) ? await db.count(storeName) : 0;
  } finally {
    db.close();
  }
}
export async function cleanup() {
  for (const dispose of close.splice(0)) dispose();
  for (const databaseName of names.splice(0)) await deleteDB(databaseName);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
