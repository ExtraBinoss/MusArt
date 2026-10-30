import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brand } from "../apps/web/src/ui/brand/config";
import { createDahliaEngine } from "../apps/web/src/ui/brand/dahlia";

/** The very same timestamped engine frame as the idle interface logo, without DOM or rasterization. */
export function renderBrandSvg(maskable = false): string {
  const frame = createDahliaEngine().sample(0.75);
  const body = `<path fill="${brand.colors.primary}" d="${frame.bodyPath}"/>`;
  const eyes = frame.eyes
    .map(
      (eye) =>
        `<path fill="${brand.colors.foreground}" d="${eye.d}" transform="${eye.matrix}" opacity="${eye.alpha}"/>`,
    )
    .join("");
  const artwork = `<g>${body}${eyes}</g>`;
  const content = maskable
    ? `<rect width="512" height="512" fill="${brand.colors.soft}"/><g transform="translate(256 256) scale(1.7)">${artwork}</g>`
    : artwork;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${maskable ? "0 0 512 512" : "-116 -116 232 232"}" role="img" aria-label="${brand.name}"><title>${brand.name}</title>${content}</svg>\n`;
}
export async function writeBrandAssets(
  root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
) {
  const source = resolve(root, "apps/web/src/ui/brand/assets"),
    publicFolder = resolve(root, "apps/web/public/branding");
  await mkdir(source, { recursive: true });
  await mkdir(publicFolder, { recursive: true });
  await writeFile(
    resolve(root, "apps/web/src/ui/brand/palette.css"),
    `/* Generated from ui/brand/config.ts by bun scripts/brand-assets.ts. */\n:root {\n  --brand-primary: ${brand.colors.primary.toLowerCase()};\n  --brand-primary-foreground: ${brand.colors.onPrimary.toLowerCase()};\n  --brand-soft: ${brand.colors.soft.toLowerCase()};\n  --brand-ink: ${brand.colors.ink.toLowerCase()};\n}\n`,
  );
  await writeFile(
    resolve(root, "apps/web/public/manifest.webmanifest"),
    JSON.stringify(
      {
        id: "./",
        name: brand.name,
        short_name: brand.name,
        start_url: "./",
        display: "standalone",
        background_color: "#fbfbfc",
        theme_color: brand.colors.primary,
        icons: [
          ...[192, 512].map((size) => ({
            src: `branding/melt-icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
            purpose: "any",
          })),
          { src: brand.assets.icon, sizes: "any", type: "image/svg+xml", purpose: "any" },
          {
            src: brand.assets.maskableIcon,
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  const htmlPath = resolve(root, "apps/web/index.html");
  const html = await readFile(htmlPath, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  });
  if (html !== null)
    await writeFile(
      htmlPath,
      html
        .replace(/<title>[^<]*<\/title>/, `<title>${brand.name}</title>`)
        .replace(
          /(<meta name="theme-color" content=")[^"]*("\s*\/>)/,
          `$1${brand.colors.primary}$2`,
        ),
    );
  const entries = ["melt.svg", "melt-maskable.svg"] as const;
  const files: Record<string, string> = {};
  for (const [index, name] of entries.entries()) {
    const content = renderBrandSvg(index === 1);
    await writeFile(resolve(source, name), content);
    await writeFile(resolve(publicFolder, name), content);
    files[name] = createHash("sha256").update(content).digest("hex");
  }
  await writeFile(
    resolve(source, "manifest.json"),
    JSON.stringify(
      {
        generator: "bun scripts/brand-assets.ts",
        engine: "Maskot 2825887abd292caa5dd46e8014f65481857fc183",
        shape: brand.mascot.shape,
        expression: brand.mascot.expression,
        time: 0.75,
        files,
      },
      null,
      2,
    ) + "\n",
  );
}
if (import.meta.main) await writeBrandAssets();

/** Optional native SVG rasterization for install platforms requiring PNG; never part of app rendering. */
export async function writeRasterBrandAssets(
  root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const folder = resolve(root, "apps/web/public/branding"),
      files: Record<string, string> = {};
    await mkdir(folder, { recursive: true });
    for (const size of [180, 192, 512]) {
      const svg = renderBrandSvg(size === 180);
      const data = await page.evaluate(
        async ({ svg, size }) => {
          const blob = new Blob([svg], { type: "image/svg+xml" }),
            url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("PNG image preparation unavailable.");
            context.drawImage(image, 0, 0, size, size);
            return canvas.toDataURL("image/png").split(",")[1]!;
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { svg, size },
      );
      const bytes = Buffer.from(data, "base64"),
        name = `melt-icon-${size}.png`;
      await writeFile(resolve(folder, name), bytes);
      files[name] = createHash("sha256").update(bytes).digest("hex");
    }
    await writeFile(
      resolve(root, "apps/web/src/ui/brand/assets/raster-manifest.json"),
      JSON.stringify(
        {
          generator: "bun scripts/brand-assets.ts --png",
          source: "melt.svg; melt-maskable.svg for Apple Touch",
          files,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await browser.close();
  }
}
if (import.meta.main && process.argv.includes("--png")) await writeRasterBrandAssets();
