import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import type { StoredFontFace, StoredFontFile } from "./model";
import { FontLibraryError } from "./validation";

interface FontDatabaseSchema extends DBSchema {
  fontFiles: { key: string; value: StoredFontFile };
  fontFaces: { key: [string, number]; value: StoredFontFace; indexes: { "by-family": string } };
}
type Write = IDBPTransaction<FontDatabaseSchema, ("fontFiles" | "fontFaces")[], "readwrite">;
/** Immutable binary originals and small variant metadata share atomic write transactions. */
export class FontStore {
  private opening: Promise<IDBPDatabase<FontDatabaseSchema>> | null = null;
  private closed = false;
  private readonly writes = new Set<Write>();
  constructor(
    private readonly name = "musart-font-library",
    private readonly invalidated: () => void = () => {},
  ) {}
  private assertOpen() {
    if (this.closed) throw new FontLibraryError("disposed", "The font library is closed.");
  }
  private open(): Promise<IDBPDatabase<FontDatabaseSchema>> {
    this.assertOpen();
    if (this.opening) return this.opening;
    const opening = openDB<FontDatabaseSchema>(this.name, 1, {
      upgrade(db) {
        db.createObjectStore("fontFiles", { keyPath: "sha256" });
        db.createObjectStore("fontFaces", { keyPath: ["family", "weight"] }).createIndex(
          "by-family",
          "family",
        );
      },
      blocking: () => {
        this.dispose();
        this.invalidated();
      },
      terminated: () => {
        this.dispose();
        this.invalidated();
      },
    }).then((db) => {
      if (this.closed) {
        db.close();
        this.assertOpen();
      }
      return db;
    });
    this.opening = opening;
    void opening.catch(() => {
      if (this.opening === opening) this.opening = null;
    });
    return opening;
  }
  async faces(): Promise<StoredFontFace[]> {
    const db = await this.open();
    this.assertOpen();
    return db.getAll("fontFaces");
  }
  async face(family: string, weight: number, nearest = false): Promise<StoredFontFace | undefined> {
    const db = await this.open();
    this.assertOpen();
    const exact = await db.get("fontFaces", [family, weight]);
    if (exact || !nearest) return exact;
    return (await db.getAllFromIndex("fontFaces", "by-family", family)).sort(
      (a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight) || a.weight - b.weight,
    )[0];
  }
  async file(sha256: string): Promise<StoredFontFile | undefined> {
    const db = await this.open();
    this.assertOpen();
    return db.get("fontFiles", sha256);
  }
  async save(file: StoredFontFile, faces: readonly StoredFontFace[]): Promise<boolean> {
    const db = await this.open();
    this.assertOpen();
    const transaction = db.transaction(["fontFiles", "fontFaces"], "readwrite");
    this.writes.add(transaction);
    let changed = false;
    try {
      const originals = transaction.objectStore("fontFiles"),
        metadata = transaction.objectStore("fontFaces");
      if (!(await originals.get(file.sha256))) {
        await originals.add(file);
        changed = true;
      }
      for (const face of faces) {
        const existing = await metadata.get([face.family, face.weight]);
        if (existing && existing.sha256 !== face.sha256)
          throw new FontLibraryError(
            "conflict",
            "A different font already owns this family and weight.",
          );
        if (!existing) {
          await metadata.add(face);
          changed = true;
        }
      }
      this.assertOpen();
      await transaction.done;
      return changed;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* A completed native transaction cannot be aborted again. */
      }
      await transaction.done.catch(() => undefined);
      throw error;
    } finally {
      this.writes.delete(transaction);
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const transaction of this.writes) {
      try {
        transaction.abort();
      } catch {
        /* Already completed. */
      }
    }
    this.writes.clear();
    void this.opening?.then(
      (db) => db.close(),
      () => undefined,
    );
  }
}
