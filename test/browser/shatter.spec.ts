import { expect, test } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type Effect,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { inspectHalfCutout, solidRedImage } from "./support/cutout-colors";

for (const forceWebGL of [false, true])
  test(`Shatter refracts a real photograph with deterministic facets and explicit alpha cutouts (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const inspection = await page.context().newPage(),
      photograph = `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`;
    const dataUrl = await inspection.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 320;
      const context = canvas.getContext("2d")!;
      context.beginPath();
      context.roundRect(0, 0, 480, 320, 24);
      context.clip();
      context.drawImage(image, 0, 0, 480, 320);
      context.fillStyle = "#f8e9cc";
      context.font = "bold 110px sans-serif";
      context.fillText("GLASS", 34, 203);
      context.strokeStyle = "#ec7252";
      context.lineWidth = 3;
      context.strokeRect(16, 16, 448, 288);
      return canvas.toDataURL("image/png");
    }, photograph);
    const asset: Asset = {
      id: "glass-photo",
      name: "Waterfall photograph",
      width: 480,
      height: 320,
      mime: "image/png",
      dataUrl,
    };
    await installReadbackProbe(page);
    if (forceWebGL)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await page.goto("/?automation=1");
    await page.bringToFront();
    await page.waitForFunction(() => Boolean(window.musart));
    let sequence = 0;
    const render = async (effect: Effect | null, scale = 1, source = asset) => {
      const project = createProject({
        id: `shatter-native-${forceWebGL}-${++sequence}`,
        assets: { [source.id]: source },
        pages: [
          createPage({
            id: "glass-page",
            width: 480,
            height: 320,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "glass-image",
                name: "Glass photograph",
                x: 0,
                y: 0,
                width: 480,
                height: 320,
                assetId: source.id,
                effects: effect ? [effect] : [],
              }),
            ],
          }),
        ],
      });
      await page.evaluate((project) => {
        window.musart!.load(project);
        window.musart!.select(["glass-image"]);
      }, project);
      await page.waitForFunction((id) => {
        const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
        return (
          canvas?.dataset.projectId === id &&
          canvas.dataset.rendererReady === "true" &&
          canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
        );
      }, project.id);
      return page.evaluate(
        ({ forceWebGL, scale }) => window.musart!.render({ forceWebGL, scale, format: "png" }),
        { forceWebGL, scale },
      );
    };
    const compare = async (a: string, b: string) =>
      inspection.evaluate(
        async ({ a, b }) => {
          const pixels = async (src: string) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            const input = context.getImageData(0, 0, image.width, image.height).data;
            const ratio = image.width / 480,
              output = new Float64Array(480 * 320 * 4);
            for (let y = 0; y < 320; y++)
              for (let x = 0; x < 480; x++) {
                for (let dy = 0; dy < ratio; dy++)
                  for (let dx = 0; dx < ratio; dx++) {
                    const index = ((y * ratio + dy) * image.width + x * ratio + dx) * 4,
                      at = (y * 480 + x) * 4,
                      alpha = input[index + 3]! / 255;
                    for (let channel = 0; channel < 3; channel++)
                      output[at + channel]! += (input[index + channel]! * alpha) / (ratio * ratio);
                    output[at + 3]! += input[index + 3]! / (ratio * ratio);
                  }
              }
            return output;
          };
          const first = await pixels(a),
            second = await pixels(b);
          let rgb = 0,
            alpha = 0,
            changed = 0,
            removed = 0,
            added = 0,
            opaque = 0;
          const removedBounds = [480, 320, -1, -1];
          for (let at = 0; at < first.length; at += 4) {
            let difference = 0;
            for (let channel = 0; channel < 3; channel++)
              difference += Math.abs(first[at + channel]! - second[at + channel]!);
            rgb += difference;
            if (difference > 6) changed++;
            alpha += Math.abs(first[at + 3]! - second[at + 3]!);
            if (first[at + 3]! - second[at + 3]! > 8) {
              removed++;
              const x = (at / 4) % 480,
                y = Math.floor(at / 4 / 480);
              removedBounds[0] = Math.min(removedBounds[0]!, x);
              removedBounds[1] = Math.min(removedBounds[1]!, y);
              removedBounds[2] = Math.max(removedBounds[2]!, x);
              removedBounds[3] = Math.max(removedBounds[3]!, y);
            }
            if (second[at + 3]! - first[at + 3]! > 1) added++;
            if (second[at + 3]! > 250) opaque++;
          }
          return {
            rgbMean: rgb / (480 * 320 * 3),
            alphaMean: alpha / (480 * 320),
            changed,
            removed,
            added,
            opaque,
            removedBounds,
          };
        },
        { a, b },
      );
    try {
      const baseline = await render(null),
        effect = createEffect("shatter"),
        impact = await render(effect),
        seeded = await render({ ...effect, seed: effect.seed + 1 }),
        repeat = await render(effect),
        enlarged = await render(effect, 2),
        cellular = await render({
          ...effect,
          settings: { ...effect.settings, pattern: "cellular" },
        }),
        cutout = await render({
          ...effect,
          settings: { ...effect.settings, cutout: true, crackWidth: 3 },
        }),
        localCutout = await render({
          ...effect,
          settings: {
            ...effect.settings,
            cutout: true,
            crackWidth: 3,
            centerX: 0.25,
            centerY: 0.25,
            radius: 0.12,
          },
        }),
        identity = await render({
          ...effect,
          amount: 0,
          settings: { ...effect.settings, cutout: true },
        }),
        opticalSettings = {
          ...effect.settings,
          cracks: 0,
          highlights: 0,
          tintStrength: 0,
          roughness: 0,
          dispersion: 0,
          displacement: 0,
          rotation: 0,
          thickness: 48,
          tilt: 0.8,
        },
        optics = await render({ ...effect, settings: { ...opticalSettings, ior: 1.52 } }),
        air = await render({ ...effect, settings: { ...opticalSettings, ior: 1 } }),
        extreme = await render({
          ...effect,
          scale: 8,
          settings: {
            ...effect.settings,
            pattern: "cellular",
            jitter: 1,
            ior: 2.5,
            thickness: 96,
            displacement: 64,
            rotation: 45,
            dispersion: 1,
            tilt: 1,
            roughness: 1,
            highlights: 3,
            centerX: 0,
            centerY: 1,
            radius: 2,
          },
        });
      const metrics = {
        impact: await compare(baseline, impact),
        seeded: await compare(impact, seeded),
        repeat: await compare(impact, repeat),
        enlarged: await compare(impact, enlarged),
        cellular: await compare(impact, cellular),
        cutout: await compare(baseline, cutout),
        localCutout: await compare(baseline, localCutout),
        identity: await compare(baseline, identity),
        optics: await compare(baseline, optics),
        air: await compare(baseline, air),
        extreme: await compare(baseline, extreme),
      };
      const redAsset = {
          ...asset,
          id: "shatter-red",
          dataUrl: await solidRedImage(inspection, 480, 320),
        },
        redEffect = {
          ...effect,
          settings: {
            ...effect.settings,
            cutout: true,
            crackWidth: 4,
            radius: 2,
            thickness: 0,
            displacement: 0,
            rotation: 0,
            roughness: 0,
            dispersion: 0,
            highlights: 0,
            tintStrength: 0,
            cracks: 1,
          },
        },
        redFull = await render(redEffect, 1, redAsset),
        redHalf = await render({ ...redEffect, amount: 0.5 }, 1, redAsset),
        partialCutout = await inspectHalfCutout(inspection, redFull, redHalf);
      const backend = await page.locator(".editor-gpu-scene canvas").getAttribute("data-backend");
      await mkdir("artifacts/shatter", { recursive: true });
      const suffix = forceWebGL ? "webgl" : "webgpu";
      for (const [name, src] of Object.entries({
        baseline,
        impact,
        seeded,
        cellular,
        cutout,
        localCutout,
        optics,
        air,
        extreme,
        redFull,
        redHalf,
      }))
        await writeFile(
          `artifacts/shatter/${name}-${suffix}.png`,
          Buffer.from(src.split(",")[1]!, "base64"),
        );
      await writeFile(
        `artifacts/shatter/metrics-${suffix}.json`,
        JSON.stringify({ backend, metrics, partialCutout }, null, 2),
      );
      expect(metrics.impact.rgbMean).toBeGreaterThan(2);
      expect(metrics.impact.changed).toBeGreaterThan(480 * 320 * 0.08);
      expect(metrics.impact.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.seeded.rgbMean).toBeGreaterThan(1);
      expect(metrics.seeded.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.repeat.rgbMean).toBe(0);
      expect(metrics.repeat.alphaMean).toBe(0);
      expect(metrics.enlarged.rgbMean).toBeLessThanOrEqual(0.25);
      expect(metrics.enlarged.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.cellular.rgbMean).toBeGreaterThan(1);
      expect(metrics.cellular.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.cutout.removed).toBeGreaterThan(480 * 320 * 0.01);
      expect(metrics.cutout.added).toBe(0);
      expect(metrics.localCutout.removed).toBeGreaterThan(0);
      expect(metrics.localCutout.removedBounds[0]).toBeGreaterThanOrEqual(81);
      expect(metrics.localCutout.removedBounds[1]).toBeGreaterThanOrEqual(41);
      expect(metrics.localCutout.removedBounds[2]).toBeLessThanOrEqual(159);
      expect(metrics.localCutout.removedBounds[3]).toBeLessThanOrEqual(119);
      expect(metrics.identity.rgbMean).toBeLessThanOrEqual(1);
      expect(metrics.identity.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.optics.rgbMean).toBeGreaterThan(1);
      expect(metrics.optics.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.air.rgbMean).toBeLessThanOrEqual(1);
      expect(metrics.air.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.extreme.opaque).toBeGreaterThan(480 * 320 * 0.8);
      expect(metrics.extreme.alphaMean).toBeLessThanOrEqual(0.01);
      expect(partialCutout.removed).toBeGreaterThan(100);
      expect(partialCutout.alphaError).toBeLessThanOrEqual(1);
      expect(partialCutout.colorError).toBeLessThanOrEqual(1);
      expect(backend).toBe(forceWebGL ? "webgl" : "webgpu");
      await render(effect);
      await page.locator('[data-layer-id="glass-image"] [data-attachment-target="effect"]').click();
      const panel = page.getByRole("dialog", { name: "Effets · Glass photograph", exact: true }),
        revision = await page.evaluate(() => window.musart!.snapshot().revision);
      await panel.getByRole("switch", { name: "Fissures transparentes", exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings?.cutout,
          ),
        )
        .toBe(true);
      expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(
        page.locator('[data-layer-id="glass-image"] [data-attachment-target="effect"]'),
      ).toBeFocused();
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings?.cutout,
          ),
        )
        .toBe(false);
      const reads = await page.evaluate(() => window.__musartVideoReadbacks);
      expect({ gpu: reads?.gpu, webgl: reads?.webgl, canvas: reads?.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      await writeFile(
        `artifacts/shatter/metrics-${suffix}.json`,
        JSON.stringify({ backend, metrics, partialCutout, reads }, null, 2),
      );
      await page.screenshot({ path: `artifacts/shatter/editor-${suffix}.png` });
    } finally {
      await inspection.close();
    }
  });
