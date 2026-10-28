import { atom } from "jotai";
import { SHAPE_CATALOG, type CatalogAsset } from "@musart/assets";

/** The chosen artwork survives tool switching; documents only receive portable geometry. */
export const shapeChoiceAtom = atom<CatalogAsset>(SHAPE_CATALOG[0]!);

export function vectorFromAsset(item: CatalogAsset) {
  const { viewBox, path, parts, strokeOnly, attribution } = item;
  return {
    viewBox,
    path,
    parts,
    strokeOnly,
    attribution,
    preserveColors: item.preserveColors ?? !!parts?.length,
  };
}
