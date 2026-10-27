import type { Asset, Composition } from "@musart/core";
import { renderComposition, type RenderOptions } from "../compositing/compositor";

export interface ExportOptions extends RenderOptions {
  format?: "png" | "jpeg" | "webp";
  quality?: number;
}

export async function exportComposition(
  page: Composition,
  assets: Record<string, Asset>,
  options: ExportOptions = {},
): Promise<Blob> {
  const canvas = await renderComposition(page, assets, options);
  const format = options.format ?? "png";
  const mime = `image/${format === "jpeg" ? "jpeg" : format}`;
  const quality = options.quality ?? 1;
  if (!Number.isFinite(quality) || quality < 0 || quality > 1)
    throw new Error("Qualité d’export invalide.");
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("L’encodage de l’image a échoué."));
        else if (blob.type !== mime)
          reject(new Error(`Le navigateur ne sait pas exporter ${format.toUpperCase()}.`));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}
