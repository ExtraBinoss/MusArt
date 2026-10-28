import { readFile, mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

export const GOOGLE_FONT_REVISION = "ddf386ba1b9fbc6b2c818f1ddcd9148f54ced94b";
interface Family {
  family: string;
  category: string;
}
interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}
export type FontRow = [
  family: string,
  category: string,
  variants: [path: string, weight: number, italic: boolean, bytes: number][],
  license: string,
];
export type Overrides = Record<string, { filename: string; url: string }[]>;
export function parseGoogleJSON(text: string): unknown {
  return JSON.parse(text.replace(/^\)\]\}'\s*/, "")) as unknown;
}
const categories: Record<string, string> = {
  "Sans Serif": "sans",
  Serif: "serif",
  Monospace: "mono",
  Display: "display",
  Handwriting: "handwriting",
};
const weights: Record<string, number> = {
  thin: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};
export function variantWeight(file: string): number {
  if (file.includes("[")) return 400;
  const style = file
    .split("/")
    .at(-1)!
    .replace(/\.(ttf|otf)$/i, "")
    .split("-")
    .at(-1)!
    .replace(/Italic|Oblique/g, "")
    .toLowerCase();
  return Object.hasOwn(weights, style) ? weights[style]! : 400;
}
/** Pure conversion: inputs are captured public metadata plus one immutable Git tree. */
export function buildFontRows(
  metadataText: string,
  treeText: string,
  overrides: Overrides = {},
): FontRow[] {
  const metadata = parseGoogleJSON(metadataText) as { familyMetadataList: Family[] };
  const tree = parseGoogleJSON(treeText) as { truncated?: boolean; tree: TreeEntry[] };
  if (!Array.isArray(metadata.familyMetadataList) || !Array.isArray(tree.tree) || tree.truncated)
    throw new Error("Incomplete Google Fonts metadata or Git tree.");
  const byFolder = new Map<string, TreeEntry[]>(),
    paths = new Set(tree.tree.map((entry) => entry.path));
  for (const entry of tree.tree) {
    const parts = entry.path.split("/");
    if (
      entry.type !== "blob" ||
      !["ofl", "apache", "ufl"].includes(parts[0]!) ||
      !/\.(ttf|otf)$/i.test(entry.path)
    )
      continue;
    const siblings = byFolder.get(parts[1]!) ?? [];
    siblings.push(entry);
    byFolder.set(parts[1]!, siblings);
  }
  return [...metadata.familyMetadataList]
    .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0))
    .map((family) => {
      const slug = family.family.toLowerCase().replace(/[^a-z0-9]/g, ""),
        candidates = byFolder.get(slug) ?? [];
      const top = candidates.filter((entry) => entry.path.split("/").length === 3);
      const files = top.length ? top : candidates;
      const variants: FontRow[2] = files
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((entry) => [
          entry.path,
          variantWeight(entry.path),
          /Italic|Oblique/.test(entry.path),
          entry.size ?? 0,
        ]);
      for (const file of overrides[family.family] ?? []) {
        if (!/\.ttf$/i.test(file.filename) || !file.url.startsWith("https://fonts.gstatic.com/"))
          continue;
        variants.push([
          file.url,
          variantWeight(file.filename),
          /Italic|Oblique/.test(file.filename),
          0,
        ]);
      }
      if (!variants.length)
        throw new Error(
          `No public outline file for ${family.family}. Add its official download manifest to overrides.`,
        );
      const folder = files[0]?.path.split("/").slice(0, 2).join("/");
      const license = folder
        ? ["OFL.txt", "LICENSE.txt", "LICENCE.txt"]
            .map((name) => `${folder}/${name}`)
            .find((path) => paths.has(path))
        : undefined;
      return [
        family.family,
        categories[family.category] ?? "sans",
        variants,
        license ?? `https://fonts.google.com/specimen/${encodeURIComponent(family.family)}#license`,
      ];
    });
}
export function catalogChunks(rows: FontRow[]): FontRow[][] {
  const chunks: FontRow[][] = [];
  let current: FontRow[] = [];
  for (const row of rows) {
    if (current.length && JSON.stringify([...current, row], null, 2).split("\n").length > 480) {
      chunks.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) chunks.push(current);
  return chunks;
}
export async function writeCatalog(
  root: string,
  metadata: string,
  tree: string,
  overrides: Overrides,
): Promise<void> {
  const rows = buildFontRows(metadata, tree, overrides),
    chunks = catalogChunks(rows),
    directory = resolve(root, "packages/assets/data/fonts/catalog");
  await mkdir(directory, { recursive: true });
  for (const name of await readdir(directory))
    if (/^part-\d+\.json$/.test(name)) await rm(resolve(directory, name));
  const names = chunks.map((_, index) => `part-${String(index).padStart(3, "0")}.json`);
  for (const [index, chunk] of chunks.entries())
    await writeFile(resolve(directory, names[index]!), JSON.stringify(chunk, null, 2) + "\n");
  const imports = names
    .map(
      (name) =>
        `  () => import("../../data/fonts/catalog/${name}").then((module) => module.default),`,
    )
    .join("\n");
  await writeFile(
    resolve(root, "packages/assets/src/fonts/google-catalog.ts"),
    `// Generated by scripts/fonts/catalog.ts; public Google Fonts metadata, local lazy chunks.\nimport type { FontDefinition } from "./catalog";\nconst revision = "${GOOGLE_FONT_REVISION}";\nconst loaders = [\n${imports}\n];\ntype Row = [string, string, [string, number, boolean, number][], string];\nconst url = (path: string) => path.startsWith("https://") ? path : \`https://raw.githubusercontent.com/google/fonts/\${revision}/\${path.split("/").map(encodeURIComponent).join("/")}\`;\nlet pending: Promise<readonly FontDefinition[]> | null = null;\nexport function loadFontCatalog(): Promise<readonly FontDefinition[]> {\n  pending ??= Promise.all(loaders.map((load) => load())).then((parts) => (parts.flat() as Row[]).map(([family, category, variants, license]) => ({ family, id: \`google:\${family}\`, category: category as FontDefinition["category"], source: "google" as const, licenseURL: url(license), variants: variants.map(([file, weight, italic, bytes]) => ({ url: url(file), weight, style: italic ? "italic" as const : "normal" as const, ...(bytes ? { bytes } : {}) })) })));\n  void pending.catch(() => { pending = null; });\n  return pending;\n}\n`,
  );
  await writeFile(
    resolve(root, "packages/assets/data/fonts/manifest.json"),
    JSON.stringify(
      {
        revision: GOOGLE_FONT_REVISION,
        families: rows.length,
        metadataSource: "https://fonts.google.com/metadata/fonts",
        metadataSHA256: createHash("sha256").update(metadata).digest("hex"),
        treeSource: `https://api.github.com/repos/google/fonts/git/trees/${GOOGLE_FONT_REVISION}?recursive=1`,
        treeSHA256: createHash("sha256").update(tree).digest("hex"),
        supplementalSource: "https://fonts.google.com/download/list?family=...",
        chunks: chunks.length,
      },
      null,
      2,
    ) + "\n",
  );
}
if (import.meta.main) {
  const [metadata, tree, overrides] = await Promise.all([
    readFile("artifacts/google-fonts-metadata.json", "utf8"),
    readFile("artifacts/google-fonts-tree.json", "utf8"),
    readFile("artifacts/google-fonts-overrides.json", "utf8"),
  ]);
  await writeCatalog(process.cwd(), metadata, tree, parseGoogleJSON(overrides) as Overrides);
  console.log("Generated the pinned, lazy Google Fonts catalog.");
}
