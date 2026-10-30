import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { plugin } from "bun";
import type {
  OutlineFont,
  OutlineGlyph,
} from "../../../../packages/render/src/surface/text/outlines";
import type { createShaper } from "../../../../packages/render/src/surface/text/shaping";
import type { weightedGlyph } from "../../../../packages/render/src/surface/text/fonts";
import type { layoutText } from "../../../../packages/render/src/surface/text/layout";
import type { quadraticCurves } from "../../../../packages/render/src/surface/text/curves";
import type { buildCurveAtlas } from "../../../../packages/render/src/surface/text/atlas";
export interface Prepared {
  font: OutlineFont;
  timings: { parseMs: number; shaperSetupMs: number };
  weightedGlyph: typeof weightedGlyph;
  layoutText: typeof layoutText;
  quadraticCurves: typeof quadraticCurves;
  buildCurveAtlas: typeof buildCurveAtlas;
  dispose(): void;
}
export interface Backend {
  prepare(bytes: ArrayBuffer): Promise<Prepared>;
}
const wasmURL = "https://musart-benchmark.invalid/hb.wasm";

/** Only adapt Vite's URL import and preloaded WASM IO; the old shaper algorithm is unchanged. */
export async function baselineLoader(worktree: string): Promise<() => void> {
  const shaping = resolve(worktree, "packages/render/src/surface/text/shaping.ts");
  const source = await readFile(shaping, "utf8");
  const expected = 'import wasmURL from "harfbuzzjs/hb.wasm?url";';
  if (!source.includes(expected)) throw Error("The baseline is not the pinned HarfBuzz adapter.");
  const wasm = await readFile(resolve(worktree, "node_modules/harfbuzzjs/hb.wasm"));
  plugin({
    name: "musart-cpu-baseline-wasm-url",
    setup(builder) {
      builder.onLoad({ filter: /\/surface\/text\/shaping\.ts$/ }, (args) => {
        if (resolve(args.path) !== shaping) return undefined;
        return {
          contents: source.replace(expected, `const wasmURL = ${JSON.stringify(wasmURL)};`),
          loader: "ts",
        };
      });
    },
  });
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url === wasmURL
      ? Promise.resolve(new Response(new Uint8Array(wasm)))
      : original(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

export async function loadBaseline(worktree: string): Promise<Backend> {
  const load = (file: string) => import(pathToFileURL(resolve(worktree, file)).href);
  const [parser, shaping, fonts, layout, curves, atlas] = (await Promise.all([
    load("node_modules/opentype.js/dist/opentype.mjs"),
    load("packages/render/src/surface/text/shaping.ts"),
    load("packages/render/src/surface/text/fonts.ts"),
    load("packages/render/src/surface/text/layout.ts"),
    load("packages/render/src/surface/text/curves.ts"),
    load("packages/render/src/surface/text/atlas.ts"),
  ])) as [
    { parse(bytes: ArrayBuffer): OutlineFont },
    {
      createShaper(
        bytes: ArrayBuffer,
        get: (id: number) => OutlineGlyph,
      ): ReturnType<typeof createShaper>;
    },
    { weightedGlyph: typeof weightedGlyph },
    { layoutText: typeof layoutText },
    { quadraticCurves: typeof quadraticCurves },
    { buildCurveAtlas: typeof buildCurveAtlas },
  ];
  return {
    async prepare(bytes) {
      const start = performance.now(),
        font = parser.parse(bytes);
      const parseMs = performance.now() - start,
        setup = performance.now();
      const shaper = await shaping.createShaper(bytes, (index) => font.glyphs.get(index));
      const shaperSetupMs = performance.now() - setup;
      font.shape = (text, weight) => shaper.shape(text, weight);
      return {
        font,
        timings: { parseMs, shaperSetupMs },
        ...fonts,
        ...layout,
        ...curves,
        ...atlas,
        dispose: () => shaper.dispose(),
      };
    },
  };
}
