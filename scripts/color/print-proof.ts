import { createHash } from "node:crypto";
import {
  ColorProfile,
  ImageMagick,
  initializeImageMagick,
  RenderingIntent,
  ResourceLimits,
} from "@imagemagick/magick-wasm";

// Build-time synthetic color samples only. Never reads production image/GPU pixels.
const root = new URL("../../packages/render/assets/profiles/", import.meta.url);
const size = 86; // Exact RGB8 lattice: 0, 3, 6, …, 255.
const rgb = new Uint8Array(await Bun.file(new URL("sRGB-v4.icc", root)).arrayBuffer());
const cmyk = new Uint8Array(await Bun.file(new URL("CGATS21_CRPC6.icc", root)).arrayBuffer());
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const binary = new URL("CRPC6-perceptual-rgb8.bin", root);
const metadata = new URL("CRPC6-perceptual-rgb8.json", root);

if (process.argv.includes("--check")) {
  const record = await Bun.file(metadata).json();
  const data = new Uint8Array(await Bun.file(binary).arrayBuffer());
  if (
    record.size !== size ||
    data.length !== size ** 3 * 4 ||
    record.rgbSha256 !== hash(rgb) ||
    record.cmykSha256 !== hash(cmyk) ||
    record.lutSha256 !== hash(data)
  )
    throw new Error("Print proof table does not match its profiles. Regenerate it.");
  console.log("Print proof table and ICC profile checksums match.");
} else {
  await initializeImageMagick(
    new Uint8Array(
      await Bun.file(
        new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
      ).arrayBuffer(),
    ),
  );
  ResourceLimits.memory = 256n * 1024n * 1024n;
  ResourceLimits.disk = 0n;
  const header = new TextEncoder().encode(`P6\n${size * size} ${size}\n255\n`);
  const ppm = new Uint8Array(header.length + size ** 3 * 3);
  ppm.set(header);
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const offset = header.length + (r + size * (g + size * b)) * 3;
        ppm.set([r * 3, g * 3, b * 3], offset);
      }
  const data = ImageMagick.read(ppm, (image) => {
    image.depth = 8;
    image.renderingIntent = RenderingIntent.Perceptual;
    if (
      !image.transformColorSpace(new ColorProfile(rgb), new ColorProfile(cmyk)) ||
      !image.transformColorSpace(new ColorProfile(rgb))
    )
      throw new Error("ICC proof table conversion failed.");
    return image.getPixels((pixels) => pixels.toByteArray(0, 0, image.width, image.height, "RGBA"));
  });
  if (!data || data.length !== size ** 3 * 4) throw new Error("Invalid ICC proof table.");
  await Bun.write(binary, data);
  await Bun.write(
    metadata,
    JSON.stringify(
      {
        size,
        channels: 4,
        order: "red-fastest, green, blue",
        intent: "Perceptual",
        transform: "sRGB-v4 → CGATS21_CRPC6 (CMYK8) → sRGB-v4 (RGB8)",
        generator: "@imagemagick/magick-wasm 0.0.45",
        rgbSha256: hash(rgb),
        cmykSha256: hash(cmyk),
        lutSha256: hash(data),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Generated ${size}³ ICC proof table (${data.length} bytes).`);
}
