import type { Page } from "@playwright/test";

export function compareReceipt(
  inspection: Page,
  a: string,
  b: string,
  width: number,
  height: number,
) {
  return inspection.evaluate(
    async ({ a, b, width, height }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height).data,
          ratio = image.width / width,
          result = new Float64Array(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            for (let j = 0; j < ratio; j++)
              for (let i = 0; i < ratio; i++) {
                const at = ((y * ratio + j) * image.width + x * ratio + i) * 4,
                  out = (y * width + x) * 4,
                  alpha = data[at + 3]! / 255;
                for (let c = 0; c < 3; c++)
                  result[out + c]! += (data[at + c]! * alpha) / (ratio * ratio);
                result[out + 3]! += data[at + 3]! / (ratio * ratio);
              }
        return result;
      };
      const first = await decode(a),
        second = await decode(b);
      let rgb = 0,
        alpha = 0,
        changed = 0,
        removed = 0,
        added = 0,
        opaque = 0;
      const removedBounds = [width, height, -1, -1];
      for (let at = 0; at < first.length; at += 4) {
        let delta = 0;
        for (let c = 0; c < 3; c++) delta += Math.abs(first[at + c]! - second[at + c]!);
        rgb += delta;
        if (delta > 6) changed++;
        alpha += Math.abs(first[at + 3]! - second[at + 3]!);
        if (second[at + 3]! > 250) opaque++;
        if (second[at + 3]! - first[at + 3]! > 1) added++;
        if (first[at + 3]! - second[at + 3]! > 8) {
          removed++;
          const x = (at / 4) % width,
            y = Math.floor(at / 4 / width);
          removedBounds[0] = Math.min(removedBounds[0]!, x);
          removedBounds[1] = Math.min(removedBounds[1]!, y);
          removedBounds[2] = Math.max(removedBounds[2]!, x);
          removedBounds[3] = Math.max(removedBounds[3]!, y);
        }
      }
      return {
        rgbMean: rgb / (width * height * 3),
        alphaMean: alpha / (width * height),
        changed,
        removed,
        added,
        opaque,
        removedBounds,
      };
    },
    { a, b, width, height },
  );
}

/** Independent integer Bayer oracle over every encoded pixel of a flat calibrated print. */
export function inspectReceiptGrid(inspection: Page, src: string, pitch = 6, seed = 42) {
  return inspection.evaluate(
    async ({ src, pitch, seed }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data,
        bayer2 = (x: number, y: number) => (x % 2) * 2 + (y % 2) * 3 - (x % 2) * (y % 2) * 4;
      const darkBounds = [image.width, image.height, -1, -1];
      let maximumError = 0,
        alphaError = 0,
        dark = 0,
        white = 0,
        sum = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
          const cellX = Math.floor((x + 0.5) / pitch) + (seed % 4),
            cellY = Math.floor((y + 0.5) / pitch) + (Math.floor(seed / 4) % 4),
            threshold =
              (bayer2(cellX, cellY) * 4 +
                bayer2(Math.floor(cellX / 2), Math.floor(cellY / 2)) +
                0.5) /
              16,
            expected = 128 / 255 < threshold ? 0 : 255,
            at = (y * image.width + x) * 4;
          let maximum = 0,
            minimum = 255;
          for (let c = 0; c < 3; c++) {
            maximumError = Math.max(maximumError, Math.abs(pixels[at + c]! - expected));
            maximum = Math.max(maximum, pixels[at + c]!);
            minimum = Math.min(minimum, pixels[at + c]!);
            sum += pixels[at + c]!;
          }
          alphaError = Math.max(alphaError, 255 - pixels[at + 3]!);
          if (maximum < 64) {
            dark++;
            darkBounds[0] = Math.min(darkBounds[0]!, x);
            darkBounds[1] = Math.min(darkBounds[1]!, y);
            darkBounds[2] = Math.max(darkBounds[2]!, x);
            darkBounds[3] = Math.max(darkBounds[3]!, y);
          }
          if (minimum > 192) white++;
        }
      return {
        maximumError,
        alphaError,
        dark,
        white,
        mean: sum / (image.width * image.height * 3),
        pixels: image.width * image.height,
        darkBounds,
      };
    },
    { src, pitch, seed },
  );
}
