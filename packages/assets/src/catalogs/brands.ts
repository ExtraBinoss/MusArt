// Catalog artwork copied from ResumI; see docs/legal/resumi-MIT.txt and data/brands.sources.md.
import type { CatalogAsset } from "../types";
import part0 from "../../data/brands-01.json";
import part1 from "../../data/brands-02.json";
import part2 from "../../data/brands-03.json";
export const items = [...part0, ...part1, ...part2] as CatalogAsset[];
