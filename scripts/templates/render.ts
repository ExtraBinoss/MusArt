import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateProject, type MotionTime } from "../../packages/core/src/index";
import type {
  MotionTemplateId,
  MotionTemplateManifest,
} from "../../apps/web/src/services/projects/templates/motion/model";

interface CoverOptions {
  readonly url: string;
  readonly inputDirectory: string;
  readonly outputDirectory: string;
  readonly edge: number;
  readonly time: MotionTime;
  readonly forceWebGL?: boolean;
  readonly ids: readonly MotionTemplateId[];
}

export function validateCoverOptions(options: CoverOptions): void {
  const url = new URL(options.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("The render server must use HTTP(S).");
  if (!Number.isInteger(options.edge) || options.edge < 64 || options.edge > 2048)
    throw Error("Cover edge must be 64–2048 pixels.");
  if (
    !Number.isSafeInteger(options.time.value) ||
    options.time.value < 0 ||
    !Number.isSafeInteger(options.time.rate) ||
    options.time.rate <= 0
  )
    throw Error("Cover time must be a nonnegative exact rational timestamp.");
  if (
    !options.ids.length ||
    new Set(options.ids).size !== options.ids.length ||
    options.ids.some((id) => id !== "in-bloom" && id !== "motion-stress-lab")
  )
    throw Error("Choose a known Motion template exactly once.");
}

/** Native renderer only: a blank same-origin document imports the actual core/Three.js modules. */
export async function renderTemplateCovers(options: CoverOptions) {
  validateCoverOptions(options);
  const inputs = await Promise.all(
    options.ids.map(async (id) => {
      const manifest = JSON.parse(
        await readFile(resolve(options.inputDirectory, `${id}.json`), "utf8"),
      ) as MotionTemplateManifest;
      if (manifest.version !== 1 || manifest.templateId !== id)
        throw Error("Invalid generated template manifest.");
      validateProject(manifest.project);
      return manifest;
    }),
  );
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--enable-unsafe-swiftshader",
      "--use-angle=vulkan",
      "--enable-features=Vulkan",
    ],
  });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const entry = new URL("/__motion-template-renderer", options.url).href;
    await page.route(entry, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><head><meta charset=utf-8><title>MusArt native headless renderer</title></head><body></body></html>",
      }),
    );
    await page.goto(entry);
    await mkdir(options.outputDirectory, { recursive: true });
    for (const manifest of inputs) {
      const captured = await page.evaluate(
        async (input) => {
          const core = (await import(
            input.coreUrl
          )) as typeof import("../../packages/core/src/index");
          const renderer = (await import(
            input.renderUrl
          )) as typeof import("../../packages/render/src/index");
          const originals = new Map<string, { revision: string; blob: Blob }>();
          for (const original of input.manifest.originals) {
            if (
              !/^media\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.mp4$/.test(original.file) ||
              original.file.includes("..")
            )
              throw Error("Unsafe original path.");
            const response = await fetch(
              new URL(`templates/motion/${original.file}`, input.baseUrl),
            );
            if (!response.ok) throw Error(`Original HTTP ${response.status}`);
            const bytes = await response.arrayBuffer();
            const digest = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join("");
            if (
              bytes.byteLength !== original.byteLength ||
              `sha256:${digest}` !== original.contentRevision
            )
              throw Error("Original integrity mismatch.");
            originals.set(original.originalId, {
              revision: original.contentRevision,
              blob: new Blob([bytes], { type: original.mime }),
            });
          }
          const project = input.manifest.project;
          const program = core.compileMotion(project, { compositionId: project.pages[0]!.id });
          const frame = core.evaluateMotion(program, input.time);
          const composition = core.applyMotionFrame(program, frame);
          const scale = input.edge / Math.max(composition.width, composition.height);
          const session = renderer.createRenderSession({
            forceWebGL: input.forceWebGL,
            maxBytes: 128 * 1024 * 1024,
          });
          try {
            const start = performance.now();
            const result = await session.withCanvasFrame(
              composition,
              project.assets,
              async (canvas) => {
                const blob = await new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(Error("Cover encoding failed."))),
                    "image/webp",
                    0.92,
                  ),
                );
                if (blob.type !== "image/webp") throw Error("Native WebP encoding is unavailable.");
                const image = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(blob);
                });
                return { image, width: canvas.width, height: canvas.height };
              },
              {
                scale,
                motionFrame: frame,
                mediaResolver: {
                  async resolveOriginal(asset, options) {
                    options?.signal?.throwIfAborted();
                    const original = originals.get(asset.originalId);
                    if (!original || original.revision !== asset.contentRevision)
                      throw Error("Original is missing.");
                    return original.blob;
                  },
                },
              },
            );
            return {
              ...result,
              stats: session.stats(),
              coldRenderMilliseconds: performance.now() - start,
            };
          } finally {
            await session.dispose();
            originals.clear();
          }
        },
        {
          manifest,
          time: options.time,
          edge: options.edge,
          forceWebGL: options.forceWebGL,
          baseUrl: new URL("/", options.url).href,
          coreUrl: new URL(`/@fs${resolve("packages/core/src/index.ts")}`, options.url).href,
          renderUrl: new URL(`/@fs${resolve("packages/render/src/index.ts")}`, options.url).href,
        },
      );
      const output = resolve(options.outputDirectory, `${manifest.templateId}.webp`);
      await writeFile(output, Buffer.from(captured.image.split(",")[1]!, "base64"));
      results.push({
        templateId: manifest.templateId,
        output,
        width: captured.width,
        height: captured.height,
        time: options.time,
        stats: captured.stats,
        coldRenderMilliseconds: captured.coldRenderMilliseconds,
      });
    }
  } finally {
    await browser.close();
  }
  return results;
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      url: { type: "string", default: "http://127.0.0.1:6110" },
      input: { type: "string", default: "apps/web/public/templates/motion" },
      output: { type: "string", default: "artifacts/motion-template-covers" },
      template: { type: "string" },
      edge: { type: "string", default: "720" },
      time: { type: "string", default: "2.4" },
      webgl: { type: "boolean", default: false },
    },
  });
  const { parseHeadlessTime } = await import("../headless/motion");
  console.log(
    JSON.stringify(
      await renderTemplateCovers({
        url: values.url,
        inputDirectory: values.input,
        outputDirectory: values.output,
        edge: Number(values.edge),
        time: parseHeadlessTime(values.time),
        forceWebGL: values.webgl,
        ids: values.template
          ? [values.template as MotionTemplateId]
          : ["in-bloom", "motion-stress-lab"],
      }),
      null,
      2,
    ),
  );
}
