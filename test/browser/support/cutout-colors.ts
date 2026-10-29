import type { Page } from "@playwright/test";

/** Native fixture encoding and inspection happen in a separate, uninstrumented page. */
export function solidRedImage(inspection: Page, width: number, height: number) {
  return inspection.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL("image/png");
    },
    { width, height },
  );
}

/** Inspect every fully removed pixel, rather than choosing a convenient crack/edge ROI. */
export function inspectHalfCutout(inspection: Page, full: string, half: string) {
  return inspection.evaluate(
    async ({ full, half }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const a = await decode(full),
        b = await decode(half);
      if (a.length !== b.length) throw new Error("Cutout inspection dimensions differ.");
      let removed = 0,
        alphaError = 0,
        colorError = 0,
        feather = 0,
        featherColorError = 0;
      for (let at = 0; at < a.length; at += 4) {
        if (a[at + 3] === 0) {
          removed++;
          alphaError = Math.max(alphaError, Math.abs(b[at + 3]! - 127.5));
          colorError = Math.max(colorError, 255 - b[at]!, b[at + 1]!, b[at + 2]!);
        }
        if (a[at + 3]! > 8 && a[at + 3]! < 247) {
          feather++;
          featherColorError = Math.max(featherColorError, 255 - a[at]!, a[at + 1]!, a[at + 2]!);
        }
      }
      return { removed, alphaError, colorError, feather, featherColorError };
    },
    { full, half },
  );
}
