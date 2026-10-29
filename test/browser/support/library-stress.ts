import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createEffect,
  type Command,
  type Effect,
  type EffectType,
  type Project,
} from "@musart/core";
import manifest from "../../../apps/web/public/benchmark/manifest.json" with { type: "json" };

export const LIBRARY_TYPES = [
  "ripple",
  "shatter",
  "noise",
  "flashlight",
  "circle",
  "cyanotype",
  "datamosh",
  "crt",
  "bit-dither",
  "receipt",
  "pink-phosphor",
] as const satisfies readonly EffectType[];
const settings: Record<(typeof LIBRARY_TYPES)[number], Partial<Effect>> = {
  ripple: {
    time: 0.25,
    settings: {
      centerX: 0.4,
      centerY: 0.4,
      innerRadius: 12,
      radius: 110,
      feather: 8,
      amplitude: 12,
      wavelength: 28,
    },
  },
  shatter: {
    scale: 32,
    settings: {
      pattern: "impact",
      radius: 1,
      innerRadius: 0,
      displacement: 6,
      thickness: 12,
      cracks: 0.7,
      cutout: false,
    },
  },
  noise: {
    scale: 32,
    amount: 0.65,
    color: true,
    time: 0.35,
    settings: { algorithm: "fbm", octaves: 3, mode: "add" },
  },
  flashlight: {
    settings: { centerX: 0.4, centerY: 0.4, radius: 0.55, ambient: 0.15, intensity: 2, glow: 0.05 },
  },
  circle: {
    settings: {
      spacing: 8,
      dotSize: 0.85,
      foreground: "#103050",
      background: "#fff4d2",
      gamma: 1.2,
    },
  },
  cyanotype: {},
  datamosh: {
    time: 0.35,
    settings: { blockSize: 24, density: 1, displacement: 24, chromaShift: 6 },
  },
  crt: { scale: 2, time: 0.35, settings: { noise: 0.02, cutout: false } },
  "bit-dither": {
    scale: 2,
    settings: { method: "bayer4", foreground: "#16344b", background: "#fff3dc" },
  },
  receipt: { scale: 2, settings: { marginX: 0.03, marginY: 0.03, cutout: false } },
  "pink-phosphor": { scale: 2, time: 0.35, settings: { glow: 0.4, grain: 0.03 } },
};

/** Same genuine originals/layout as the legacy load, with authored-size library presets. */
export async function libraryStressProject() {
  const originals: {
    file: string;
    sha256: string;
    expected: string;
    bytes: number;
    width: number;
    height: number;
  }[] = [];
  for (let offset = 0; offset < manifest.images.length; offset += 5)
    await Promise.all(
      manifest.images.slice(offset, offset + 5).map(async (image) => {
        const bytes = await readFile(
          new URL(`../../../apps/web/public/benchmark/${image.file}`, import.meta.url),
        );
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (sha256 !== image.sha256) throw new Error(`Original fingerprint changed: ${image.file}`);
        originals.push({
          file: image.file,
          sha256,
          expected: image.sha256,
          bytes: bytes.length,
          width: image.width,
          height: image.height,
        });
      }),
    );
  // The shared web fixture imports bundler JSON. Bun runs that exact factory;
  // Playwright's Node ESM runner receives only its portable JSON, before any input.
  const { stdout } = await promisify(execFile)(
    "bun",
    [
      "-e",
      `
    import { createPerformanceProject } from './apps/web/src/services/projects/performance-project.ts';
    import { readFile } from 'node:fs/promises';
    const project = await createPerformanceProject(50, async path =>
      'data:image/jpeg;base64,' + (await readFile('apps/web/public' + path)).toString('base64'));
    process.stdout.write(JSON.stringify(project));
  `,
    ],
    { cwd: fileURLToPath(new URL("../../../", import.meta.url)), maxBuffer: 64 * 1024 * 1024 },
  );
  const fixture = JSON.parse(stdout) as Project;
  const page = fixture.pages[0]!;
  for (const layer of page.layers) {
    if (layer.kind === "image") {
      const index = Number(layer.id.slice("stress-image-".length));
      const type = LIBRARY_TYPES[index % LIBRARY_TYPES.length]!;
      layer.effects = [
        createEffect(type, { id: `library-fx-${index}`, seed: 42 + index, ...settings[type] }),
        createEffect("contrast", { id: `library-contrast-${index}`, amount: 0.56 }),
      ];
    } else if (layer.id.startsWith("stress-label-")) {
      const index = Number(layer.id.slice("stress-label-".length));
      layer.text = `${String(index + 1).padStart(2, "0")} / ${LIBRARY_TYPES[index % LIBRARY_TYPES.length]}`;
    } else if (layer.id === "stress-subtitle")
      layer.text = "50 image layers / 11 effect types / 100 effects";
  }
  fixture.id = "effect-library-stress-50";
  fixture.name = "50 photographic layers · Eleven effects";
  const neutral: Command[] = page.layers
    .filter((layer) => layer.kind === "image")
    .map((layer) => ({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...layer.effects[0]!, amount: 0 }, layer.effects[1]!] },
    }));
  return {
    project: fixture,
    neutral,
    originals: originals.sort((a, b) => a.file.localeCompare(b.file)),
    files: originals.length,
    distinctOriginals: new Set(originals.map((image) => image.sha256)).size,
    totalEncodedBytes: originals.reduce((sum, image) => sum + image.bytes, 0),
    declaredDecodedBytes: originals.reduce((sum, image) => sum + image.width * image.height * 4, 0),
  };
}

export function libraryScene(project: Project) {
  const page = project.pages[0]!,
    photos = page.layers.filter((layer) => layer.kind === "image");
  return {
    projectId: project.id,
    images: photos.length,
    effects: photos.reduce((sum, layer) => sum + layer.effects.length, 0),
    groups: page.layers.filter((layer) => layer.kind === "group").length,
    masks: photos.filter((layer) => layer.mask?.enabled).length,
    assets: Object.keys(project.assets).length,
    types: Object.fromEntries(
      LIBRARY_TYPES.map((type) => [
        type,
        photos.filter((layer) => layer.effects[0]?.type === type).length,
      ]),
    ),
  };
}
