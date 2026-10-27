import type { Page } from "@playwright/test";
export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ImageWitness {
  width: number;
  height: number;
  colors: number;
  regions: { colors: number; opaque: number; hash: number; backgroundDistance: number }[];
}
/** Browser-native image decode in a separate page, outside the production readback probes. */
export async function inspectImage(
  page: Page,
  image: string | Buffer,
  regions: ImageRegion[] = [],
  inspectorPage?: Page,
): Promise<ImageWitness> {
  const ownsInspector = inspectorPage === undefined;
  const inspector = inspectorPage ?? (await page.context().newPage());
  try {
    const url =
      typeof image === "string" ? image : `data:image/png;base64,${image.toString("base64")}`;
    return await inspector.evaluate(
      async ({ url, regions }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const inspect = (region: { x: number; y: number; width: number; height: number }) => {
          const colors = new Set<string>();
          let opaque = 0,
            hash = 2166136261,
            backgroundDistance = 0;
          for (let y = 0; y < 20; y++)
            for (let x = 0; x < 20; x++) {
              const px = Math.min(
                canvas.width - 1,
                Math.max(
                  0,
                  Math.floor((region.x + (region.width * (x + 0.5)) / 20) * canvas.width),
                ),
              );
              const py = Math.min(
                canvas.height - 1,
                Math.max(
                  0,
                  Math.floor((region.y + (region.height * (y + 0.5)) / 20) * canvas.height),
                ),
              );
              const offset = (py * canvas.width + px) * 4;
              const rgba = pixels.slice(offset, offset + 4);
              colors.add(`${rgba[0]},${rgba[1]},${rgba[2]}`);
              if (rgba[3]! > 250) opaque++;
              backgroundDistance = Math.max(
                backgroundDistance,
                Math.abs(rgba[0]! - 242) + Math.abs(rgba[1]! - 240) + Math.abs(rgba[2]! - 235),
              );
              for (const channel of rgba) hash = Math.imul(hash ^ channel, 16777619);
            }
          return {
            colors: colors.size,
            opaque: opaque / 400,
            hash: hash >>> 0,
            backgroundDistance,
          };
        };
        return {
          width: canvas.width,
          height: canvas.height,
          colors: inspect({ x: 0, y: 0, width: 1, height: 1 }).colors,
          regions: regions.map(inspect),
        };
      },
      { url, regions },
    );
  } finally {
    if (ownsInspector) await inspector.close();
  }
}
export const contactSheetRegions: ImageRegion[] = Array.from({ length: 50 }, (_, index) => ({
  x: (48 + (index % 10) * 230 + 22) / 2400,
  y: (235 + Math.floor(index / 10) * 222 + 17) / 1500,
  width: 176 / 2400,
  height: 131 / 1500,
}));
