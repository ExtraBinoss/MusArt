import { decodePeaks, mountainPath } from "./geometry";
import type { BankAtlas, BankJob } from "./model";
export const BANK_ATLAS_BYTES = 8 * 1024 * 1024;

/** Two bounded UI-only bitmaps. Canvas reads are never used; originals stay unrelated to GPU pixels. */
export function prepareBankAtlas(job: Extract<BankJob, { type: "atlas" }>): BankAtlas {
  const { width, height, dpr, shapes, palette } = job;
  const pixelWidth = Math.ceil(width * dpr),
    rowHeight = Math.ceil(height * dpr),
    pixelHeight = rowHeight * shapes.length;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(dpr) ||
    dpr <= 0 ||
    width < 1 ||
    height !== 16 ||
    shapes.length !== 15 ||
    pixelWidth * pixelHeight * 8 > BANK_ATLAS_BYTES
  )
    throw Error("Sound-bank waveform atlas exceeds its bounded size.");
  const canvases = [
    new OffscreenCanvas(pixelWidth, pixelHeight),
    new OffscreenCanvas(pixelWidth, pixelHeight),
  ];
  try {
    const paths = shapes.map((shape) => mountainPath(decodePeaks(shape), pixelWidth, rowHeight));
    for (const [index, canvas] of canvases.entries()) {
      const context = canvas.getContext("2d");
      if (!context) throw Error("Canvas waveform preparation is unavailable.");
      context.fillStyle = index === 0 ? palette.neutral : palette.active;
      for (let row = 0; row < shapes.length; row++) {
        context.setTransform(1, 0, 0, 1, 0, row * rowHeight);
        context.fill(paths[row]!);
      }
    }
    const neutral = canvases[0]!.transferToImageBitmap();
    try {
      return {
        neutral,
        active: canvases[1]!.transferToImageBitmap(),
        width: pixelWidth,
        height: rowHeight,
        dpr,
      };
    } catch (error) {
      neutral.close();
      throw error;
    }
  } finally {
    for (const canvas of canvases) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
