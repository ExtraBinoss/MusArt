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
import { inspectPhosphors } from "./support/phosphor-shapes";

for (const forceWebGL of [false, true])
  test(`CRT displays a real photo through distinct masks, beam lines and source optics (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
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
      context.fillStyle = "#eeeecc";
      context.font = "bold 116px sans-serif";
      context.fillText("CRT", 98, 205);
      context.fillStyle = "#b4b4b4";
      context.fillRect(336, 16, 128, 48);
      context.fillStyle = "#000000";
      context.fillRect(24, 260, 160, 32);
      context.fillStyle = "#ffffff";
      context.fillRect(72, 264, 64, 24);
      return canvas.toDataURL("image/png");
    }, photograph);
    const asset: Asset = {
      id: "crt-photo",
      name: "Waterfall CRT photograph",
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
        id: `crt-native-${forceWebGL}-${++sequence}`,
        assets: { [source.id]: source },
        pages: [
          createPage({
            id: "crt-page",
            width: 480,
            height: 320,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "crt-image",
                name: "CRT photograph",
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
        window.musart!.select(["crt-image"]);
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
    const compare = (a: string, b: string) =>
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
            const input = context.getImageData(0, 0, image.width, image.height).data,
              ratio = image.width / 480,
              output = new Float64Array(480 * 320 * 4);
            for (let y = 0; y < 320; y++)
              for (let x = 0; x < 480; x++)
                for (let dy = 0; dy < ratio; dy++)
                  for (let dx = 0; dx < ratio; dx++) {
                    const index = ((y * ratio + dy) * image.width + x * ratio + dx) * 4,
                      at = (y * 480 + x) * 4,
                      alpha = input[index + 3]! / 255;
                    for (let c = 0; c < 3; c++)
                      output[at + c]! += (input[index + c]! * alpha) / (ratio * ratio);
                    output[at + 3]! += input[index + 3]! / (ratio * ratio);
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
          for (let at = 0; at < first.length; at += 4) {
            let difference = 0;
            for (let c = 0; c < 3; c++) difference += Math.abs(first[at + c]! - second[at + c]!);
            rgb += difference;
            if (difference > 6) changed++;
            alpha += Math.abs(first[at + 3]! - second[at + 3]!);
            if (first[at + 3]! - second[at + 3]! > 8) removed++;
            if (second[at + 3]! - first[at + 3]! > 1) added++;
            if (second[at + 3]! > 250) opaque++;
          }
          const rows: number[] = [];
          for (let y = 24; y < 56; y++) {
            let sum = 0;
            for (let x = 344; x < 456; x++) {
              const at = (y * 480 + x) * 4;
              sum += (second[at]! + second[at + 1]! + second[at + 2]!) / 3;
            }
            rows.push(sum / 112);
          }
          return {
            rgbMean: rgb / (480 * 320 * 3),
            alphaMean: alpha / (480 * 320),
            changed,
            removed,
            added,
            opaque,
            rowRange: Math.max(...rows) - Math.min(...rows),
          };
        },
        { a, b },
      );
    try {
      const baseline = await render(null),
        effect = createEffect("crt"),
        clean = {
          ...effect.settings,
          maskStrength: 0,
          scanlineStrength: 0,
          curvatureX: 0,
          curvatureY: 0,
          zoom: 1,
          convergence: 0,
          glow: 0,
          brightness: 1,
          contrast: 1,
          saturation: 1,
          vignette: 0,
          roundness: 0,
          noise: 0,
          jitter: 0,
          flicker: 0,
          rollingBar: 0,
        },
        isolated = (settings: NonNullable<Effect["settings"]>) => ({
          ...effect,
          settings: { ...clean, ...settings },
        }),
        normal = await render(effect),
        enlarged = await render(effect, 2),
        aperture = await render(isolated({ mask: "aperture", maskStrength: 1 })),
        shadow = await render(isolated({ mask: "shadow", maskStrength: 1 })),
        slot = await render(isolated({ mask: "slot", maskStrength: 1 })),
        beam = await render(
          isolated({ scanlineStrength: 1, scanlinePitch: 4, scanlineWidth: 0.5 }),
        ),
        convergence = await render(isolated({ convergence: 4 })),
        glow = await render(isolated({ glow: 0.8, glowRadius: 12 })),
        glowPoint = await render(isolated({ glow: 0.8, glowRadius: 0 })),
        curvature = await render(isolated({ curvatureX: 0.25, curvatureY: 0.2 })),
        animated = {
          ...effect,
          time: 0.125,
          settings: { ...effect.settings, noise: 0.25, jitter: 3, flicker: 0.2, rollingBar: 0.5 },
        },
        timed = await render(animated),
        seeded = await render({ ...animated, seed: effect.seed + 1 }),
        repeat = await render(animated),
        earlier = await render({ ...animated, time: 0 }),
        cutout = await render(
          isolated({ cutout: true, curvatureX: 0.4, curvatureY: 0.4, zoom: 0.9, roundness: 0.18 }),
        ),
        identity = await render({
          ...animated,
          amount: 0,
          settings: { ...animated.settings, cutout: true },
        }),
        extreme = await render({
          ...effect,
          scale: 1,
          time: 86400,
          seed: 2147483647,
          settings: {
            ...effect.settings,
            mask: "slot",
            maskStrength: 1,
            maskGap: 0.8,
            scanlinePitch: 1,
            scanlineWidth: 0.1,
            curvatureX: 0.5,
            curvatureY: 0.5,
            zoom: 0.5,
            convergence: 12,
            glow: 2,
            glowRadius: 24,
            brightness: 3,
            contrast: 3,
            saturation: 2,
            vignette: 1,
            roundness: 0.5,
            borderSoftness: 8,
            noise: 0.5,
            jitter: 12,
            flicker: 0.5,
            flickerRate: 60,
            rollingBar: 1,
            rollingSpeed: -2,
          },
        });
      const metrics = {
        normal: await compare(baseline, normal),
        density: await compare(normal, enlarged),
        aperture: await compare(baseline, aperture),
        shadow: await compare(aperture, shadow),
        slot: await compare(shadow, slot),
        beam: await compare(baseline, beam),
        convergence: await compare(baseline, convergence),
        glow: await compare(baseline, glow),
        glowRadius: await compare(glowPoint, glow),
        curvature: await compare(baseline, curvature),
        seeded: await compare(timed, seeded),
        repeat: await compare(timed, repeat),
        time: await compare(earlier, timed),
        cutout: await compare(baseline, cutout),
        identity: await compare(baseline, identity),
        extreme: await compare(baseline, extreme),
      };
      const redAsset = {
          ...asset,
          id: "crt-red",
          dataUrl: await solidRedImage(inspection, 480, 320),
        },
        redEffect = isolated({
          cutout: true,
          curvatureX: 0.4,
          curvatureY: 0.4,
          zoom: 0.8,
          roundness: 0.2,
          borderSoftness: 4,
          bezelColor: "#000000",
        }),
        redFull = await render(redEffect, 1, redAsset),
        redHalf = await render({ ...redEffect, amount: 0.5 }, 1, redAsset),
        partialCutout = await inspectHalfCutout(inspection, redFull, redHalf);
      const whiteUrl = await inspection.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 480;
          canvas.height = 320;
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, 480, 320);
          return canvas.toDataURL("image/png");
        }),
        whiteAsset = { ...asset, id: "crt-white", dataUrl: whiteUrl };
      const calibration: Record<string, Awaited<ReturnType<typeof inspectPhosphors>>> = {};
      const calibrationImages: Record<string, string> = {};
      for (const mask of ["aperture", "shadow", "slot"]) {
        const src = await render(
          { ...isolated({ mask, maskStrength: 1, maskGap: 0.2 }), scale: 8 },
          1,
          whiteAsset,
        );
        calibration[mask] = await inspectPhosphors(inspection, src);
        calibrationImages[`calibration-${mask}`] = src;
      }
      const backend = await page.locator(".editor-gpu-scene canvas").getAttribute("data-backend"),
        suffix = forceWebGL ? "webgl" : "webgpu";
      await mkdir("artifacts/crt", { recursive: true });
      for (const [name, src] of Object.entries({
        baseline,
        normal,
        aperture,
        shadow,
        slot,
        beam,
        convergence,
        glow,
        curvature,
        timed,
        cutout,
        extreme,
        redFull,
        redHalf,
        ...calibrationImages,
      }))
        await writeFile(
          `artifacts/crt/${name}-${suffix}.png`,
          Buffer.from(src.split(",")[1]!, "base64"),
        );
      await writeFile(
        `artifacts/crt/metrics-${suffix}.json`,
        JSON.stringify({ backend, metrics, partialCutout, calibration }, null, 2),
      );
      for (const name of [
        "normal",
        "aperture",
        "shadow",
        "slot",
        "beam",
        "convergence",
        "glow",
        "curvature",
        "seeded",
        "time",
      ] as const)
        expect(metrics[name].rgbMean, name).toBeGreaterThan(1);
      expect(metrics.beam.rowRange).toBeGreaterThan(60);
      expect(metrics.glowRadius.rgbMean).toBeGreaterThan(0.1);
      for (const name of [
        "normal",
        "aperture",
        "shadow",
        "slot",
        "beam",
        "convergence",
        "glow",
        "curvature",
        "seeded",
        "time",
        "extreme",
      ] as const)
        expect(metrics[name].alphaMean, name).toBeLessThanOrEqual(0.01);
      expect(metrics.repeat.rgbMean).toBe(0);
      expect(metrics.repeat.alphaMean).toBe(0);
      expect(metrics.density.rgbMean).toBeLessThanOrEqual(0.25);
      expect(metrics.density.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.identity.rgbMean).toBeLessThanOrEqual(1);
      expect(metrics.identity.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.cutout.removed).toBeGreaterThan(480 * 320 * 0.01);
      expect(metrics.cutout.added).toBe(0);
      expect(metrics.extreme.opaque).toBeGreaterThan(480 * 320 * 0.8);
      expect(partialCutout.removed).toBeGreaterThan(100);
      expect(partialCutout.alphaError).toBeLessThanOrEqual(1);
      expect(partialCutout.colorError).toBeLessThanOrEqual(1);
      expect(partialCutout.feather).toBeGreaterThan(0);
      expect(partialCutout.featherColorError).toBeLessThanOrEqual(1);
      expect(calibration.aperture!.darkRows).toBe(0);
      expect(calibration.aperture!.maxHeight).toBe(320);
      expect(calibration.shadow!.complete).toBeGreaterThan(100);
      expect(
        Math.abs(calibration.shadow!.meanWidth - calibration.shadow!.meanHeight),
      ).toBeLessThanOrEqual(1);
      expect(calibration.slot!.complete).toBeGreaterThan(100);
      expect(calibration.slot!.meanHeight).toBeGreaterThan(calibration.slot!.meanWidth * 2);
      expect(calibration.slot!.darkRows).toBeGreaterThan(10);
      expect(backend).toBe(forceWebGL ? "webgl" : "webgpu");
      await render(effect);
      const trigger = page.locator('[data-layer-id="crt-image"] [data-attachment-target="effect"]');
      await trigger.click();
      const panel = page.getByRole("dialog", { name: "Effets · CRT photograph", exact: true }),
        revision = await page.evaluate(() => window.musart!.snapshot().revision);
      await panel.locator(".layer-attachment-viewport").evaluate((node) => {
        node.scrollTop = 450;
      });
      const brightness = panel.getByRole("textbox", { name: "Luminosité", exact: true });
      await brightness.fill("1.3");
      await brightness.press("Enter");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings
                ?.brightness,
          ),
        )
        .toBe(1.3);
      expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings
                ?.brightness,
          ),
        )
        .toBe(1.1);
      const reads = await page.evaluate(() => window.__musartVideoReadbacks);
      expect({ gpu: reads?.gpu, webgl: reads?.webgl, canvas: reads?.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      await writeFile(
        `artifacts/crt/metrics-${suffix}.json`,
        JSON.stringify({ backend, metrics, partialCutout, calibration, reads }, null, 2),
      );
      await page.screenshot({ path: `artifacts/crt/editor-${suffix}.png` });
    } finally {
      await inspection.close();
    }
  });
