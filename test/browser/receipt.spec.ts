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
import { compareReceipt, inspectReceiptGrid } from "./support/receipt-pixels";

for (const forceWebGL of [false, true])
  test(`Receipt prints the source photo with calibrated dots, real margins and paper cuts (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const inspection = await page.context().newPage(),
      photo = `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`;
    const dataUrl = await inspection.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      context.beginPath();
      context.roundRect(0, 0, 320, 480, 20);
      context.clip();
      context.drawImage(image, 0, 0, 320, 480);
      context.fillStyle = "#ffffff";
      context.font = "bold 84px monospace";
      context.fillText("PRINT", 34, 257);
      context.globalCompositeOperation = "destination-out";
      context.beginPath();
      context.arc(160, 412, 8, 0, Math.PI * 2);
      context.fill();
      return canvas.toDataURL("image/png");
    }, photo);
    const asset: Asset = {
      id: "receipt-photo",
      name: "Thermal photograph",
      width: 320,
      height: 480,
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
        id: `receipt-native-${forceWebGL}-${++sequence}`,
        assets: { [source.id]: source },
        pages: [
          createPage({
            id: "receipt-page",
            width: source.width,
            height: source.height,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "receipt-image",
                name: "Thermal photograph",
                x: 0,
                y: 0,
                width: source.width,
                height: source.height,
                assetId: source.id,
                effects: effect ? [effect] : [],
              }),
            ],
          }),
        ],
      });
      await page.evaluate((project) => {
        window.musart!.load(project);
        window.musart!.select(["receipt-image"]);
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
    const compare = (a: string, b: string) => compareReceipt(inspection, a, b, 320, 480);
    try {
      const effect = createEffect("receipt"),
        baseline = await render(null),
        normal = await render(effect),
        seeded = await render({ ...effect, seed: effect.seed + 1 }),
        repeat = await render(effect),
        enlarged = await render(effect, 2),
        stochastic = await render({
          ...effect,
          settings: { ...effect.settings, mode: "stochastic" },
        }),
        threshold = await render({
          ...effect,
          settings: { ...effect.settings, mode: "threshold" },
        }),
        clean = {
          ...effect.settings,
          paperColor: "#ffffff",
          inkColor: "#000000",
          gamma: 1,
          contrast: 1,
          exposure: 0,
          inkOpacity: 1,
          dotSpread: 0,
          dotSoftness: 0.01,
          wear: 0,
          feedBanding: 0,
          streaks: 0,
          marginX: 0,
          marginY: 0,
          paperTexture: 0,
          foldStrength: 0,
          edge: "straight",
          edgeShade: 0,
        },
        isolated = (settings: NonNullable<Effect["settings"]>) => ({
          ...effect,
          settings: { ...clean, ...settings },
        }),
        plain = await render(isolated({})),
        margins = await render(isolated({ marginX: 0.12, marginY: 0.1 })),
        worn = await render(isolated({ wear: 0.8 })),
        feed = await render(isolated({ feedBanding: 1 })),
        texture = await render(isolated({ paperTexture: 0.3, fiberSize: 4 })),
        fold = await render(isolated({ foldStrength: 0.8, foldPosition: 0.5, foldWidth: 12 })),
        torn = await render({
          ...effect,
          settings: { ...effect.settings, cutout: true, edgeHeight: 24 },
        }),
        perforated = await render({
          ...effect,
          settings: { ...effect.settings, cutout: true, edgeHeight: 24, edge: "perforated" },
        }),
        straight = await render({
          ...effect,
          settings: { ...effect.settings, cutout: true, edgeHeight: 24, edge: "straight" },
        }),
        identity = await render({
          ...effect,
          amount: 0,
          settings: { ...effect.settings, cutout: true },
        }),
        extreme = await render({
          ...effect,
          scale: 1,
          seed: 2147483647,
          settings: {
            ...effect.settings,
            mode: "stochastic",
            exposure: -1,
            gamma: 0.2,
            contrast: 4,
            dotSpread: 0.4,
            dotSoftness: 0.6,
            wear: 0.95,
            feedBanding: 1,
            feedPitch: 1,
            streaks: 1,
            streakWidth: 24,
            marginX: 0.45,
            marginY: 0.45,
            paperTexture: 0.4,
            fiberSize: 0.25,
            edgeHeight: 32,
            edgePitch: 2,
            edgeJitter: 1,
            edgeSoftness: 0.1,
            edgeShade: 1,
            foldStrength: 1,
            foldWidth: 0.5,
          },
        });
      const metrics = {
        normal: await compare(baseline, normal),
        seed: await compare(normal, seeded),
        repeat: await compare(normal, repeat),
        density: await compare(normal, enlarged),
        stochastic: await compare(normal, stochastic),
        threshold: await compare(normal, threshold),
        margins: await compare(plain, margins),
        wear: await compare(plain, worn),
        feed: await compare(plain, feed),
        texture: await compare(plain, texture),
        fold: await compare(plain, fold),
        torn: await compare(baseline, torn),
        perforated: await compare(torn, perforated),
        straight: await compare(baseline, straight),
        identity: await compare(baseline, identity),
        extreme: await compare(baseline, extreme),
      };
      const flatUrl = await inspection.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = 240;
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#808080";
          context.fillRect(0, 0, 240, 240);
          return canvas.toDataURL("image/png");
        }),
        flatAsset = { ...asset, id: "receipt-gray", width: 240, height: 240, dataUrl: flatUrl },
        calibrated = { ...isolated({}), scale: 6 },
        grid = await render(calibrated, 1, flatAsset),
        contracted = await render(
          { ...calibrated, settings: { ...clean, dotSpread: -0.2 } },
          1,
          flatAsset,
        ),
        spread = await render(
          { ...calibrated, settings: { ...clean, dotSpread: 0.3 } },
          1,
          flatAsset,
        ),
        blank = await render({ ...calibrated, settings: { ...clean, exposure: 1 } }, 1, flatAsset),
        black = await render({ ...calibrated, settings: { ...clean, exposure: -1 } }, 1, flatAsset),
        missing = await render(
          { ...calibrated, settings: { ...clean, exposure: -1, wear: 1 } },
          1,
          flatAsset,
        ),
        fitContain = await render(
          {
            ...calibrated,
            settings: { ...clean, exposure: -1, marginX: 0.25, marginY: 0, fit: "contain" },
          },
          1,
          flatAsset,
        ),
        fitStretch = await render(
          {
            ...calibrated,
            settings: { ...clean, exposure: -1, marginX: 0.25, marginY: 0, fit: "stretch" },
          },
          1,
          flatAsset,
        );
      const calibration = {
        grid: await inspectReceiptGrid(inspection, grid),
        contracted: await inspectReceiptGrid(inspection, contracted),
        spread: await inspectReceiptGrid(inspection, spread),
        blank: await inspectReceiptGrid(inspection, blank),
        black: await inspectReceiptGrid(inspection, black),
        missing: await inspectReceiptGrid(inspection, missing),
        fitContain: await inspectReceiptGrid(inspection, fitContain),
        fitStretch: await inspectReceiptGrid(inspection, fitStretch),
      };
      const redAsset = {
          ...asset,
          id: "receipt-red",
          dataUrl: await solidRedImage(inspection, 320, 480),
        },
        redEffect = isolated({
          cutout: true,
          edge: "torn",
          edgeHeight: 16,
          edgeSoftness: 4,
          paperColor: "#ff0000",
          inkColor: "#ff0000",
        }),
        redFull = await render(redEffect, 1, redAsset),
        redHalf = await render({ ...redEffect, amount: 0.5 }, 1, redAsset),
        partialCutout = await inspectHalfCutout(inspection, redFull, redHalf),
        backend = await page.locator(".editor-gpu-scene canvas").getAttribute("data-backend"),
        suffix = forceWebGL ? "webgl" : "webgpu";
      await mkdir("artifacts/receipt", { recursive: true });
      for (const [name, src] of Object.entries({
        baseline,
        normal,
        stochastic,
        threshold,
        margins,
        worn,
        feed,
        texture,
        fold,
        torn,
        perforated,
        straight,
        extreme,
        grid,
        contracted,
        spread,
        blank,
        black,
        missing,
        fitContain,
        fitStretch,
        redFull,
        redHalf,
      }))
        await writeFile(
          `artifacts/receipt/${name}-${suffix}.png`,
          Buffer.from(src.split(",")[1]!, "base64"),
        );
      await writeFile(
        `artifacts/receipt/metrics-${suffix}.json`,
        JSON.stringify({ backend, metrics, calibration, partialCutout }, null, 2),
      );
      for (const name of [
        "normal",
        "seed",
        "stochastic",
        "threshold",
        "margins",
        "wear",
        "feed",
        "texture",
        "fold",
      ] as const)
        expect(metrics[name].rgbMean, name).toBeGreaterThan(1);
      for (const name of [
        "normal",
        "seed",
        "stochastic",
        "threshold",
        "margins",
        "wear",
        "feed",
        "texture",
        "fold",
        "straight",
        "extreme",
      ] as const)
        expect(metrics[name].alphaMean, name).toBeLessThanOrEqual(0.01);
      expect(metrics.repeat.rgbMean).toBe(0);
      expect(metrics.repeat.alphaMean).toBe(0);
      expect(metrics.density.rgbMean).toBeLessThanOrEqual(0.25);
      expect(metrics.density.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.identity.rgbMean).toBeLessThanOrEqual(1);
      expect(metrics.identity.alphaMean).toBeLessThanOrEqual(0.01);
      expect(metrics.torn.removed).toBeGreaterThan(1000);
      expect(metrics.torn.added).toBe(0);
      expect(metrics.perforated.alphaMean).toBeGreaterThan(1);
      expect(metrics.extreme.opaque).toBeGreaterThan(320 * 480 * 0.8);
      expect(calibration.grid.maximumError).toBeLessThanOrEqual(1);
      expect(calibration.grid.alphaError).toBe(0);
      expect(calibration.grid.dark).toBe((240 * 240) / 2);
      expect(calibration.grid.white).toBe((240 * 240) / 2);
      expect(calibration.contracted.dark).toBeLessThan(calibration.grid.dark);
      expect(calibration.spread.dark).toBeGreaterThan(calibration.grid.dark);
      expect(calibration.blank.white).toBe(240 * 240);
      expect(calibration.black.dark).toBe(240 * 240);
      expect(calibration.missing.white).toBe(240 * 240);
      expect(calibration.fitContain.darkBounds).toEqual([60, 60, 179, 179]);
      expect(calibration.fitStretch.darkBounds).toEqual([60, 0, 179, 239]);
      expect(partialCutout.removed).toBeGreaterThan(100);
      expect(partialCutout.alphaError).toBeLessThanOrEqual(1);
      expect(partialCutout.colorError).toBeLessThanOrEqual(1);
      expect(partialCutout.featherColorError).toBeLessThanOrEqual(1);
      expect(backend).toBe(forceWebGL ? "webgl" : "webgpu");
      await render(effect);
      const trigger = page.locator(
        '[data-layer-id="receipt-image"] [data-attachment-target="effect"]',
      );
      await trigger.click();
      await page.locator(".layer-attachment-viewport").evaluate((node) => {
        node.scrollTop = 450;
      });
      const panel = page.getByRole("dialog", { name: "Effets · Thermal photograph", exact: true }),
        revision = await page.evaluate(() => window.musart!.snapshot().revision),
        margin = panel.getByRole("textbox", { name: "Marge horizontale", exact: true });
      await margin.fill("12");
      await margin.press("Enter");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings?.marginX,
          ),
        )
        .toBe(0.12);
      expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings?.marginX,
          ),
        )
        .toBe(0.04);
      const reads = await page.evaluate(() => window.__musartVideoReadbacks);
      expect({ gpu: reads?.gpu, webgl: reads?.webgl, canvas: reads?.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      await writeFile(
        `artifacts/receipt/metrics-${suffix}.json`,
        JSON.stringify({ backend, metrics, calibration, partialCutout, reads }, null, 2),
      );
      await page.screenshot({ path: `artifacts/receipt/editor-${suffix}.png` });
    } finally {
      await inspection.close();
    }
  });
