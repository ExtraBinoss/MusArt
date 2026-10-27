// Adapted from ResumI (MIT); artwork notices are preserved in data/ and docs/legal/.
import type { AssetKind, CatalogAsset } from "./types";
import { SHAPE_CATALOG } from "./catalogs/core-shapes";
import social from "../data/social.json";
import linkedIn from "../data/linkedin.json";

export type { AssetKind, CatalogAsset, VectorArtwork, VectorPart } from "./types";
export { createSearchIndex, normalizeSearch } from "./search";
export { SHAPE_CATALOG } from "./catalogs/core-shapes";
export const SOCIAL_BRANDS: readonly CatalogAsset[] = [...social, linkedIn];
const cached = new Map<AssetKind, Promise<readonly CatalogAsset[]>>();
const loaders = {
  shapes: async () => [...SHAPE_CATALOG, ...(await import("./catalogs/shapes")).items],
  icons: async () => (await import("./catalogs/icons")).items,
  brands: async () => {
    const { items } = await import("./catalogs/brands");
    const ids = new Set(items.map((item) => item.id));
    return [...items, ...SOCIAL_BRANDS.filter((item) => !ids.has(item.id))];
  },
};

/** Lazy local catalogs, shared across picker instances. Failed loads remain retryable. */
export function loadAssets(kind: AssetKind): Promise<readonly CatalogAsset[]> {
  let pending = cached.get(kind);
  if (!pending) {
    pending = loaders[kind]().catch((error: unknown) => {
      cached.delete(kind);
      throw error;
    });
    cached.set(kind, pending);
  }
  return pending;
}

export function assetKind(id: string): AssetKind {
  return id.startsWith("brand-") ? "brands" : id.startsWith("lucide:") ? "icons" : "shapes";
}

function escape(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Emits vetted catalog geometry with original brand paints and full credits. */
export function assetSvg(asset: CatalogAsset): string {
  const paths = asset.parts?.map((part) => {
    const attributes: Record<string, string | number | undefined> = {
      d: part.path,
      fill: part.fill,
      stroke: part.stroke,
      "stroke-width": part.strokeWidth,
      opacity: part.opacity,
      "fill-rule": part.fillRule,
      "stroke-linecap": part.linecap,
      "stroke-linejoin": part.linejoin,
      transform: part.matrix ? `matrix(${part.matrix.join(" ")})` : undefined,
    };
    return `<path ${Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${name}="${escape(value!)}"`)
      .join(" ")}/>`;
  });
  const geometry =
    paths?.join("") ??
    `<path d="${escape(asset.path ?? "")}" ${
      asset.strokeOnly
        ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        : 'fill="currentColor"'
    }/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escape(asset.viewBox)}" role="img" aria-label="${escape(asset.name)}"><title>${escape(asset.name)}</title>${asset.attribution ? `<metadata>${escape(asset.attribution)}</metadata>` : ""}${geometry}</svg>`;
}
