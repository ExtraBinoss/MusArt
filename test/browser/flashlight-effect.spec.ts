import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";
import { densityEnvironment } from "./support/effect-density";

for (const forceWebGL of [false, true])
  test(`Flash Light: photographic spotlight, ellipse controls and exact export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const d = await photographicEffect(page, "flashlight", forceWebGL);
    try {
      await d.load({ amount: 0 });
      const original = await d.png();
      await d.save("original", original);
      const id = await d.load();
      const spotlight = await d.png();
      await d.save("default", spotlight);
      const difference = await d.compare(original, spotlight);
      expect(difference.opaqueMeanRGB).toBeGreaterThan(8);
      expect(difference.alphaMax).toBe(0);
      expect((await d.compare(spotlight, await d.png())).differentBytes).toBe(0);
      expect((await d.compare(spotlight, await d.png(2), 2)).differentBytes).toBe(0);
      const zooms = await d.matchedZooms(id);
      const variants: unknown[] = [];
      for (const settings of [
        { centerX: 0.2, centerY: 0.25, radius: 0.25, softness: 0, grain: 0 },
        { aspect: 2.5, rotation: 50, lightColor: "#77aaff", intensity: 2, exposure: 1 },
        { invert: true, falloff: 4, ambient: 0.05 },
        { grain: 0.4, grainSize: 4, glow: 0.3, saturation: 0, highlightCompression: 1 },
      ]) {
        await d.load({ settings });
        const output = await d.png(),
          metrics = await d.compare(spotlight, output);
        expect(metrics.opaqueMeanRGB).toBeGreaterThan(2);
        expect(metrics.alphaMax).toBe(0);
        await d.save(`variant-${variants.length}`, output);
        variants.push({ settings, metrics });
      }
      // A fully dark spotlight is exactly black within existing source coverage.
      await d.load({ settings: { intensity: 0, ambient: 0, glow: 0, grain: 0 } });
      const black = await d.png();
      await d.save("black", black);
      const blackPixels = await d.inspection.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        let rgb = 0,
          alpha = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          rgb = Math.max(rgb, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
          alpha = Math.max(alpha, pixels[i + 3]!);
        }
        return { rgb, alpha };
      }, black);
      expect(blackPixels).toEqual({ rgb: 0, alpha: 255 });
      const flatSource = await d.inspection.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 192;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 192, 192);
        return canvas.toDataURL("image/png");
      });
      await d.load(
        {
          settings: {
            centerX: 0.5,
            centerY: 0.5,
            radius: 0.25,
            softness: 0.5,
            falloff: 1,
            ambient: 0,
            intensity: 1,
            glow: 0,
            grain: 0,
            lightColor: "#ffffff",
            highlightCompression: 0,
          },
        },
        {
          id: "flat-source",
          name: "White beam calibration",
          width: 192,
          height: 192,
          mime: "image/png",
          dataUrl: flatSource,
        },
      );
      const calibration = await d.png();
      await d.save("calibration", calibration);
      const beam = await d.inspection.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 256, 256).data;
        const at = (x: number, y: number) =>
          Array.from(pixels.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
        return { center: at(128, 128), transition: at(164, 128), outside: at(190, 128) };
      }, calibration);
      expect(beam.center).toEqual([255, 255, 255, 255]);
      expect(beam.outside).toEqual([0, 0, 0, 255]);
      const t = (Math.hypot(36.5, 0.5) - 24) / 24;
      const expected = Math.round((1 - t * t * (3 - 2 * t)) * 255);
      for (const value of beam.transition.slice(0, 3))
        expect(Math.abs(value! - expected)).toBeLessThanOrEqual(1);
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(d.backend);
      expect(environment.reads.gpu + environment.reads.webgl + environment.reads.canvas).toBe(0);
      expect(d.errors).toEqual([]);
      await writeFile(
        `artifacts/flashlight/${d.backend}.json`,
        JSON.stringify(
          { difference, zooms, variants, blackPixels, beam, environment, errors: d.errors },
          null,
          2,
        ),
      );
    } finally {
      await d.close();
    }
  });
