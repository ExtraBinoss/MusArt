import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Layer } from "@musart/core";
import { baselineLoader, loadBaseline } from "./backend";
import { workloads } from "./workloads";

const [mode, runText, output, oldWorktree] = process.argv.slice(2);
if ((mode !== "baseline" && mode !== "candidate") || !output || !/^[123]$/.test(runText ?? ""))
  throw Error("Usage: bun run.ts baseline|candidate 1|2|3 OUTPUT_DIR [BASELINE_WORKTREE]");
if (mode === "baseline" && !oldWorktree) throw Error("A frozen baseline worktree is required.");
const root = resolve(import.meta.dir, "../../../.."),
  bytes = new Map<string, ArrayBuffer>();
for (const item of workloads)
  if (!bytes.has(item.file))
    bytes.set(
      item.file,
      new Uint8Array(await readFile(resolve(root, "apps/web/public/fonts", item.file))).buffer,
    );
const restore = mode === "baseline" ? await baselineLoader(resolve(oldWorktree!)) : () => {};
const moduleStart = performance.now();
const backend =
  mode === "baseline" ? await loadBaseline(resolve(oldWorktree!)) : await import("./candidate");
const moduleMs = performance.now() - moduleStart;
const boot = await backend.prepare(bytes.values().next().value!);
const startup = { moduleMs, ...boot.timings };
boot.dispose();
let sink = 0;
const rows = [];
try {
  for (const item of workloads) {
    const data = bytes.get(item.file)!,
      prepared = await backend.prepare(data);
    try {
      const { font, weightedGlyph, layoutText, quadraticCurves, buildCurveAtlas } = prepared;
      const text = item.text.normalize("NFC");
      const missing = [
        ...new Set(Array.from(text).filter((c) => !/\s/u.test(c) && !font.charToGlyph(c).index)),
      ];
      if (missing.length) throw Error(`Required ${item.id} lacks ${missing.join(" ")}`);
      const started = performance.now(),
        shaped = font.shape!(text, item.weight);
      const firstShapeMs = performance.now() - started;
      const glyphSignature = shaped.map((g) => [g.glyph.index, g.advance, g.dx, g.dy, g.cluster]);
      const warmStarted = performance.now();
      for (let i = 0; i < 128; i++) sink += font.shape!(text, item.weight).length;
      const warmShapeMs = (performance.now() - warmStarted) / 128;
      const unique = [...new Map(shaped.map((g) => [g.glyph.index, g.glyph])).values()];
      const pathsStarted = performance.now();
      const paths = unique.map((glyph) => {
        const path = weightedGlyph(font, glyph, item.weight).getPath(0, 0, font.unitsPerEm, {
          xScale: 1,
          yScale: 1,
        });
        const curves = quadraticCurves(path.commands);
        sink += curves.length;
        return {
          id: glyph.index,
          bounds: path.getBoundingBox(),
          commands: path.commands,
          curves: curves.length,
        };
      });
      const firstPathsAndCurvesMs = performance.now() - pathsStarted;
      const pathsWarmStarted = performance.now();
      for (let i = 0; i < 16; i++)
        for (const glyph of unique) {
          const path = weightedGlyph(font, glyph, item.weight).getPath(0, 0, font.unitsPerEm, {
            xScale: 1,
            yScale: 1,
          });
          sink += quadraticCurves(path.commands).length;
        }
      const warmPathsAndCurvesMs = (performance.now() - pathsWarmStarted) / 16;
      const layer = {
        text: item.text,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize,
        fontWeight: item.weight,
        lineHeight: 1.2,
        letterSpacing: "letterSpacing" in item ? item.letterSpacing : 0,
        textAlign: "left",
      } as Layer;
      const layoutStarted = performance.now(),
        placed = layoutText(layer, font);
      const firstLayoutMs = performance.now() - layoutStarted,
        preparationStarted = performance.now();
      for (let i = 0; i < item.copies; i++) {
        const result = layoutText(layer, font),
          atlas = buildCurveAtlas(
            result.map((g) => g.glyph),
            font.unitsPerEm,
          );
        sink += atlas.bytes;
        atlas.texture.dispose();
      }
      const wrappedPreparationMs = performance.now() - preparationStarted;
      rows.push({
        id: item.id,
        file: item.file,
        sha256: createHash("sha256").update(new Uint8Array(data)).digest("hex"),
        weight: item.weight,
        opsz: 14,
        unitsPerEm: font.unitsPerEm,
        copies: item.copies,
        ...prepared.timings,
        firstShapeMs,
        warmShapeMs,
        firstPathsAndCurvesMs,
        warmPathsAndCurvesMs,
        firstLayoutMs,
        wrappedPreparationMs,
        glyphSignature,
        paths,
        placed: placed.map((g) => [g.glyph.index, g.x, g.baseline]),
      });
    } finally {
      prepared.dispose();
    }
  }
} finally {
  restore();
}
const report = {
  mode,
  run: Number(runText),
  startup,
  runtime: process.versions,
  cpu: cpus()[0]?.model,
  inputHash: createHash("sha256").update(JSON.stringify(workloads)).digest("hex"),
  note: "CPU preparation only; font/WASM bytes pre-read outside timing; no network, GPU or bitmap APIs.",
  sink,
  rows,
};
await mkdir(output, { recursive: true });
const destination = resolve(output, `${mode}-cpu-${runText}.json`);
await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
console.log(destination);
