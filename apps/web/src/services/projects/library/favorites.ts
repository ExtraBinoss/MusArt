import { openDB } from "idb";
export interface LibraryItem {
  kind: "project" | "template";
  id: string;
  name: string;
  mode: "static" | "motion";
  pageId?: string;
  preview?: string;
  width?: number;
  height?: number;
}
export const libraryItemKey = (item: Pick<LibraryItem, "kind" | "id">) => `${item.kind}:${item.id}`;
const STORE = "favorites",
  LIMIT = 128;
async function database() {
  return openDB("musart-library", 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: "key" });
    },
  });
}
function validate(value: unknown): LibraryItem {
  if (!value || typeof value !== "object") throw Error("Invalid library favorite.");
  const item = value as LibraryItem;
  if (
    !["project", "template"].includes(item.kind) ||
    typeof item.id !== "string" ||
    !item.id ||
    item.id.length > 200 ||
    typeof item.name !== "string" ||
    item.name.length > 500 ||
    !["static", "motion"].includes(item.mode) ||
    (item.pageId !== undefined && (typeof item.pageId !== "string" || item.pageId.length > 200))
  )
    throw Error("Invalid library favorite.");
  return {
    kind: item.kind,
    id: item.id,
    name: item.name,
    mode: item.mode,
    ...(item.pageId ? { pageId: item.pageId } : {}),
  };
}
/** Small durable bookmarks, independent of documents/assets. Each mutation owns one IDB transaction. */
export async function readLibraryFavorites(): Promise<LibraryItem[]> {
  const db = await database();
  try {
    const entries = await db.getAll(STORE, undefined, LIMIT + 1);
    if (entries.length > LIMIT) throw Error("Library favorites exceed their limit.");
    return entries.map(validate);
  } finally {
    db.close();
  }
}
export async function setLibraryFavorite(item: LibraryItem, selected: boolean): Promise<void> {
  const value = validate(item),
    key = libraryItemKey(value),
    db = await database();
  try {
    const tx = db.transaction(STORE, "readwrite");
    try {
      if (selected) {
        if (!(await tx.store.get(key)) && (await tx.store.count()) >= LIMIT)
          throw Error("The favorites list is full.");
        await tx.store.put({ ...value, key });
      } else await tx.store.delete(key);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}
