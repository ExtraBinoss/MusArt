import type { FontLibraryPort } from "../../../services/fonts/model";
import type { FontOption } from "./catalog";
interface MetadataEntry {
  value?: readonly FontOption[];
  pending?: Promise<readonly FontOption[]>;
}
const entries = new WeakMap<FontLibraryPort, MetadataEntry>();
/** Metadata only: original font bytes remain exclusively in the platform library. */
export function peekFontMetadata(library: FontLibraryPort): readonly FontOption[] | undefined {
  return entries.get(library)?.value;
}
export function invalidateFontMetadata(library: FontLibraryPort): void {
  entries.delete(library);
}
/** Closed pickers reuse installed names without opening IndexedDB for every selected text layer. */
export function loadFontMetadata(library: FontLibraryPort): Promise<readonly FontOption[]> {
  const previous = entries.get(library);
  if (previous?.value) return Promise.resolve(previous.value);
  if (previous?.pending) return previous.pending;
  const entry: MetadataEntry = {};
  let request: Promise<readonly FontOption[]>;
  try {
    request = library.installed();
  } catch (error) {
    return Promise.reject(error);
  }
  const pending = request.then(
    (value) => {
      if (entries.get(library) === entry) {
        entry.value = value;
        delete entry.pending;
      }
      return value;
    },
    (error) => {
      if (entries.get(library) === entry) entries.delete(library);
      throw error;
    },
  );
  entry.pending = pending;
  entries.set(library, entry);
  return pending;
}
