import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";
import { densityEnvironment } from "./support/effect-density";

for (const forceWebGL of [false, true])
  test(`Cyanotype: true photo, blue print controls, independent tonal endpoints and exact export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const d = await photographicEffect(page, "cyanotype", forceWebGL);
    try {
      await d.load({ amount: 0 });
      const original = await d.png();
      await d.save("original", original);
      const id = await d.load(),
        printed = await d.png();
      await d.save("default", printed);
      const difference = await d.compare(original, printed);
      expect(difference.opaqueMeanRGB).toBeGreaterThan(8);
      expect(difference.alphaMax).toBe(0);
      expect((await d.compare(printed, await d.png())).differentBytes).toBe(0);
      expect((await d.compare(printed, await d.png(2), 2)).differentBytes).toBe(0);
      const zooms = await d.matchedZooms(id),
        variants: unknown[] = [];
      for (const settings of [
        { exposure: 1, gamma: 1.8, contrast: 1.6, density: 2, blackPoint: 0.15, whitePoint: 0.8 },
        { invert: true, wash: 0.4, inkColor: "#002c54", paperColor: "#fffdf0" },
        {
          unevenness: 1,
          textureScale: 16,
          paperGrain: 0.4,
          grainScale: 3,
          fibers: 0.4,
          fiberScale: 2,
          edgeFade: 1,
          edgeWidth: 48,
        },
        { exposure: -4, gamma: 0.1, contrast: 4, density: 4, blackPoint: 0.45, whitePoint: 0.55 },
      ]) {
        await d.load({ settings });
        const output = await d.png(),
          metrics = await d.compare(printed, output);
        expect(metrics.opaqueMeanRGB).toBeGreaterThan(2);
        expect(metrics.alphaMax).toBe(0);
        await d.save(`variant-${variants.length}`, output);
        variants.push({ settings, metrics });
      }
      const paper = {
        unevenness: 1,
        textureScale: 16,
        paperGrain: 0.2,
        grainScale: 3,
        fibers: 0.2,
        fiberScale: 2,
      };
      await d.load({ seed: 42, settings: paper });
      const seeded = await d.png();
      await d.load({ seed: 93, settings: paper });
      const seedDifference = await d.compare(seeded, await d.png());
      expect(seedDifference.opaqueMeanRGB).toBeGreaterThan(1);
      await d.load({ seed: 42, settings: paper });
      expect((await d.compare(seeded, await d.png())).differentBytes).toBe(0);
      const source = await d.inspection.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 192;
        const context = canvas.getContext("2d")!;
        for (const [index, value] of [0, 128, 255].entries()) {
          context.fillStyle = `rgb(${value},${value},${value})`;
          context.fillRect(index * 64, 0, 64, 192);
        }
        return canvas.toDataURL("image/png");
      });
      const tones = {
        id: "print-tones",
        name: "Black gray white print calibration",
        width: 192,
        height: 192,
        mime: "image/png",
        dataUrl: source,
      };
      const settings = {
        contrast: 1,
        gamma: 1,
        exposure: 0,
        blackPoint: 0,
        whitePoint: 1,
        wash: 0,
        unevenness: 0,
        paperGrain: 0,
        fibers: 0,
        edgeFade: 0,
      };
      await d.load({ settings }, tones);
      const calibrated = await d.png();
      await d.save("calibration", calibrated);
      const samples = await d.inspection.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, 256, 256).data;
        return [64, 128, 192].map((x) =>
          Array.from(data.subarray((128 * 256 + x) * 4, (128 * 256 + x) * 4 + 4)),
        );
      }, calibrated);
      expect(samples[0]).toEqual([18, 61, 120, 255]);
      expect(samples[2]).toEqual([244, 241, 223, 255]);
      const coverage = (1 - Math.exp(-(1 - 128 / 255) * 1.15 * 2)) / (1 - Math.exp(-1.15 * 2));
      for (let c = 0; c < 3; c++) {
        const ink = [18, 61, 120][c]!,
          paper = [244, 241, 223][c]!;
        expect(
          Math.abs(samples[1]![c]! - Math.round(paper + (ink - paper) * coverage)),
        ).toBeLessThanOrEqual(1);
      }
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(d.backend);
      expect(environment.reads.gpu + environment.reads.webgl + environment.reads.canvas).toBe(0);
      expect(d.errors).toEqual([]);
      await writeFile(
        `artifacts/cyanotype/${d.backend}.json`,
        JSON.stringify(
          { difference, zooms, variants, seedDifference, samples, environment, errors: d.errors },
          null,
          2,
        ),
      );
    } finally {
      await d.close();
    }
  });
