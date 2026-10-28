import {
  isPublishedComposition,
  isPublishedProject,
  type Asset,
  type Composition,
  type Project,
} from "@musart/core";

interface Entry {
  assets: Record<string, Asset>;
  result: Promise<string>;
}

/** Reuse only exact immutable graphs whose ownership was proven at the save boundary. */
export class ThumbnailDigestMemo {
  private pages = new WeakMap<Composition, Entry>();
  private assets = new WeakSet<Record<string, Asset>>();
  private generation = 0;

  certify(project: Project): void {
    if (isPublishedProject(project)) this.assets.add(project.assets);
  }

  get(
    page: Composition,
    assets: Record<string, Asset>,
    compute: () => Promise<string>,
  ): Promise<string> {
    const generation = this.generation;
    const current = () => {
      if (generation !== this.generation)
        throw new DOMException("Thumbnail digest scope changed.", "AbortError");
    };
    const cacheable = isPublishedComposition(page) && this.assets.has(assets);
    if (!cacheable) {
      try {
        return compute().then((value) => {
          current();
          return value;
        });
      } catch (error) {
        return Promise.reject(error);
      }
    }
    const cached = this.pages.get(page);
    if (cached?.assets === assets)
      return cached.result.then((value) => {
        current();
        return value;
      });
    const entry: Entry = {
      assets,
      result: Promise.resolve()
        .then(() => {
          current();
          return compute();
        })
        .then((value) => {
          current();
          return value;
        })
        .catch((error: unknown) => {
          if (this.pages.get(page) === entry) this.pages.delete(page);
          throw error;
        }),
    };
    this.pages.set(page, entry);
    return entry.result;
  }

  /** A store can reopen later, but no result or ownership proof crosses its closed generation. */
  reset(): void {
    this.generation++;
    this.pages = new WeakMap();
    this.assets = new WeakSet();
  }
}
