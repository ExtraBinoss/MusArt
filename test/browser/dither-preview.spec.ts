import { expect, test, type Locator, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Asset } from "@musart/core";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { previewScale } from "../../apps/web/src/canvas/render/preview-quality";
import { rasterExtent } from "../../packages/render/src/compositing/types";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";
import { WHEEL_PAN_SPEED } from "../../apps/web/src/canvas/viewport/view";

declare global {
  interface Window {
    __referenceWheelDelivery?: {
      capturedAt: number;
      timeStamp: number;
      deltaX: number;
      deltaY: number;
      ctrlKey: boolean;
      dpr: number;
    }[];
    __referenceStopWheels?: () => void;
  }
}

// The user's actual Chrome reproduction uses DPR1.25. Other density tests cover DPR1.
test.use({ viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1.25 });
async function capture(page: Page, locator: Locator, dpr: number) {
  const bounds = (await locator.boundingBox())!;
  const pixels = [Math.round(bounds.width * dpr), Math.round(bounds.height * dpr)];
  const clip = {
    x: Math.round(bounds.x * dpr) / dpr,
    y: Math.round(bounds.y * dpr) / dpr,
    width: pixels[0]! / dpr,
    height: pixels[1]! / dpr,
  };
  const image = await page.screenshot({ clip, scale: "device" });
  return {
    bounds,
    clip,
    pixels,
    image,
    dataUrl: `data:image/png;base64,${image.toString("base64")}`,
  };
}
async function compare(inspector: Page, reference: string, candidate: string) {
  return inspector.evaluate(
    async ({ reference, candidate }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          pixels: context.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const a = await decode(reference),
        b = await decode(candidate);
      if (a.width !== b.width || a.height !== b.height)
        throw new Error("Comparison requires identical physical footprints.");
      let error = 0,
        samples = 0;
      const errors: number[] = [];
      // Fixed central opaque crop, including the fine image texture and flower;
      // no alignment search, alpha/checker backgrounds or selection frame edges.
      for (let y = Math.ceil(a.height * 0.19); y < Math.floor(a.height * 0.81); y++)
        for (let x = Math.ceil(a.width * 0.19); x < Math.floor(a.width * 0.81); x++) {
          const offset = (y * a.width + x) * 4;
          let pixel = 0;
          for (let channel = 0; channel < 3; channel++)
            pixel += Math.abs(a.pixels[offset + channel]! - b.pixels[offset + channel]!);
          error += pixel;
          samples++;
          errors.push(pixel / 3);
        }
      errors.sort((a, b) => a - b);
      return {
        dimensions: [a.width, a.height],
        rgbMean: error / (samples * 3),
        p95: errors[Math.floor(errors.length * 0.95)]!,
        cornerAlpha: b.pixels[3],
      };
    },
    { reference, candidate },
  );
}

for (const forceWebGL of [false, true])
  for (const patternScale of [1, 2])
    test(`reference plane: actual dither→halftone stack scale${patternScale}, visible main/popover, DPR1.25 (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const inspection = await page.context().newPage();
      const sourcePath =
        process.env.MUSART_REFERENCE_IMAGE ?? "apps/web/public/benchmark/50-waterfall-5.jpg";
      const bytes = await readFile(sourcePath),
        mime = sourcePath.endsWith(".webp")
          ? "image/webp"
          : sourcePath.endsWith(".jpg")
            ? "image/jpeg"
            : "image/png";
      const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
      const source = await inspection.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          dimensions: [image.naturalWidth, image.naturalHeight],
          cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
        };
      }, dataUrl);
      const sourceSize = source.dimensions;
      const asset: Asset = {
        id: "reference-original",
        name: "Original detailed image",
        width: sourceSize[0]!,
        height: sourceSize[1]!,
        mime,
        dataUrl,
      };
      const layer = createLayer("image", {
        id: "reference-owner",
        x: 0,
        y: 0,
        width: 778,
        height: 778,
        assetId: asset.id,
        effects: [
          createEffect("dither", {
            amount: 1,
            scale: patternScale,
            levels: 2,
            color: false,
            seed: 42,
          }),
          createEffect("halftone", {
            amount: 1,
            scale: patternScale,
            levels: 2,
            color: true,
            seed: 42,
          }),
        ],
      });
      const composition = createPage({
        id: "reference-page",
        width: 778,
        height: 778,
        background: "transparent",
        layers: [layer],
      });
      const project = createProject({ assets: { [asset.id]: asset }, pages: [composition] });
      await installReadbackProbe(page);
      await page.addInitScript(() => {
        window.__referenceWheelDelivery = [];
        const listener = (event: WheelEvent) =>
          window.__referenceWheelDelivery!.push({
            capturedAt: performance.now(),
            timeStamp: event.timeStamp,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            ctrlKey: event.ctrlKey,
            dpr: devicePixelRatio,
          });
        window.addEventListener("wheel", listener, true);
        window.__referenceStopWheels = () => window.removeEventListener("wheel", listener, true);
      });
      if (forceWebGL)
        await page.addInitScript(() =>
          Object.defineProperty(navigator, "gpu", { value: undefined }),
        );
      await page.goto("/?automation=1");
      await page.waitForFunction(() => Boolean(window.musart));
      await page.evaluate((project) => {
        window.musart!.load(project);
        window.musart!.select(["reference-owner"]);
      }, project);
      const dpr = await page.evaluate(() => devicePixelRatio);
      const ready = async (zoom: number) => {
        const width = rasterExtent(778, previewScale(composition, zoom * dpr));
        await page.waitForFunction(
          ({ id, width }) => {
            const d = document.querySelector<HTMLCanvasElement>(
              ".editor-gpu-scene canvas",
            )?.dataset;
            return (
              d?.projectId === id &&
              d.rendererReady === "true" &&
              d.sceneRevision === d.renderedRevision &&
              Number(d.renderWidth) === width
            );
          },
          { id: project.id, width },
        );
      };
      await ready(1);
      await page.locator(".editor-gpu-scene").evaluate(async (node) => {
        await Promise.all(
          node
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      const backend = await page.locator(".editor-gpu-scene canvas").getAttribute("data-backend");
      expect(backend).toBe(forceWebGL ? "webgl" : "webgpu");
      const exports: string[] = [];
      for (const scale of [1, 2])
        exports.push(
          await page.evaluate(
            ({ scale, forceWebGL }) => window.musart!.render({ scale, forceWebGL, format: "png" }),
            { scale, forceWebGL },
          ),
        );
      const exportIdentity = await inspection.evaluate(async (urls) => {
        const decode = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return {
            width: image.width,
            height: image.height,
            pixels: context.getImageData(0, 0, image.width, image.height).data,
          };
        };
        const a = await decode(urls[0]!),
          b = await decode(urls[1]!);
        let differingBytes = 0,
          maximumAlpha = 0,
          minimumValue = 255,
          maximumValue = 0;
        for (let offset = 0; offset < a.pixels.length; offset += 4) {
          maximumAlpha = Math.max(maximumAlpha, a.pixels[offset + 3]!);
          if (a.pixels[offset + 3]! > 250) {
            minimumValue = Math.min(minimumValue, a.pixels[offset]!);
            maximumValue = Math.max(maximumValue, a.pixels[offset]!);
          }
        }
        for (let y = 0; y < a.height; y++)
          for (let x = 0; x < a.width; x++)
            for (let dy = 0; dy < 2; dy++)
              for (let dx = 0; dx < 2; dx++)
                for (let c = 0; c < 4; c++)
                  if (
                    a.pixels[(y * a.width + x) * 4 + c] !==
                    b.pixels[((y * 2 + dy) * b.width + x * 2 + dx) * 4 + c]
                  )
                    differingBytes++;
        return {
          dimensions: [
            [a.width, a.height],
            [b.width, b.height],
          ],
          differingBytes,
          cornerAlpha: a.pixels[3],
          maximumAlpha,
          valueRange: maximumValue - minimumValue,
        };
      }, exports);
      expect(exportIdentity.dimensions).toEqual([
        [778, 778],
        [1556, 1556],
      ]);
      expect(exportIdentity.differingBytes).toBe(0);
      expect(exportIdentity.cornerAlpha).toBe(source.cornerAlpha);
      expect(exportIdentity.maximumAlpha).toBe(255);
      expect(exportIdentity.valueRange).toBeGreaterThan(128);
      const poses: unknown[] = [];
      for (const zoom of [0.31, 0.49, 0.5, 0.51, 1, 2]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(zoom);
        poses.push(
          await page.locator(".editor-gpu-scene canvas").evaluate((canvas) => {
            const c = canvas as HTMLCanvasElement,
              bounds = c.getBoundingClientRect();
            return {
              intrinsic: [c.width, c.height],
              requested: [Number(c.dataset.renderWidth), Number(c.dataset.renderHeight)],
              bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
              gpu: JSON.parse(c.dataset.gpuStats ?? "{}"),
            };
          }),
        );
      }
      await page.getByRole("button", { name: "Exporter", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
      const preview = dialog.getByRole("img", { name: "Aperçu de l’export", exact: true });
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate((image) => {
            const img = image as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }),
        )
        .toBe(true);
      await dialog.evaluate(async (node) => {
        await Promise.all(
          node
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      expect(
        await dialog.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).isIdentity),
      ).toBe(true);
      const thumbnail = await preview.evaluate(async (element) => {
        const image = element as HTMLImageElement;
        await image.decode();
        const blob = await (await fetch(image.src)).blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Preview data URL missing."));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const bounds = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return {
          dataUrl,
          natural: [image.naturalWidth, image.naturalHeight],
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
          style: {
            inlineWidth: image.style.width,
            inlineHeight: image.style.height,
            width: style.width,
            height: style.height,
            maxWidth: style.maxWidth,
            maxHeight: style.maxHeight,
            transform: style.transform,
          },
        };
      });
      expect(
        thumbnail.natural[0],
        JSON.stringify({
          natural: thumbnail.natural,
          bounds: thumbnail.bounds,
          style: thumbnail.style,
        }),
      ).toBe(Math.round(thumbnail.bounds.width * dpr));
      expect(thumbnail.natural[1]).toBe(Math.round(thumbnail.bounds.height * dpr));
      const matchingZoom = thumbnail.bounds.width / 778;
      await page.getByTestId("artboard").hover();
      await zoomViewport(page, matchingZoom);
      await ready(matchingZoom);
      const selection = page.locator('.canvas-selection[data-layer-id="reference-owner"]');
      const beforePan = (await selection.boundingBox())!;
      const beforePreview = (await preview.boundingBox())!;
      const phaseDelta = (a: number, b: number) =>
        ((a - b) * dpr - Math.round((a - b) * dpr)) / dpr;
      const pan = {
        x: phaseDelta(beforePan.x, beforePreview.x),
        y: phaseDelta(beforePan.y, beforePreview.y),
      };
      // Match geometric pixel phase with real viewport input, never by searching
      // image pixels or moving a production surface through injected styles.
      if (Math.abs(pan.x) > 0.005 || Math.abs(pan.y) > 0.005) {
        await page.mouse.wheel((pan.x * dpr) / WHEEL_PAN_SPEED, (pan.y * dpr) / WHEEL_PAN_SPEED);
        await expect
          .poll(async () => {
            const a = (await selection.boundingBox())!,
              b = (await preview.boundingBox())!;
            return Math.max(
              Math.abs(phaseDelta(a.x, b.x) * dpr),
              Math.abs(phaseDelta(a.y, b.y) * dpr),
            );
          })
          .toBeLessThan(0.025);
        await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
      }
      const main = await capture(page, selection, dpr);
      const popup = await capture(page, preview, dpr);
      expect(main.pixels).toEqual(popup.pixels);
      const visible = await compare(inspection, main.dataUrl, popup.dataUrl);
      const sameDensityPng = await page.evaluate(
        ({ scale, forceWebGL }) => window.musart!.render({ scale, forceWebGL, format: "png" }),
        { scale: thumbnail.natural[0]! / 778, forceWebGL },
      );
      const encoded = await compare(inspection, sameDensityPng, thumbnail.dataUrl);
      const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
      const environment = await page.evaluate(async () => {
        const adapter = await navigator.gpu?.requestAdapter(),
          info = adapter?.info;
        window.__referenceStopWheels?.();
        delete window.__referenceStopWheels;
        return {
          browser: navigator.userAgent,
          viewport: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          adapter: info
            ? {
                vendor: info.vendor,
                architecture: info.architecture,
                device: info.device,
                description: info.description,
              }
            : null,
          wheelDelivery: window.__referenceWheelDelivery,
        };
      });
      const key = `${forceWebGL ? "webgl" : "webgpu"}-scale${patternScale}`;
      await mkdir("artifacts/reference-surfaces", { recursive: true });
      await writeFile(`artifacts/reference-surfaces/${key}-main.png`, main.image);
      await writeFile(`artifacts/reference-surfaces/${key}-popover.png`, popup.image);
      await writeFile(
        `artifacts/reference-surfaces/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "Native screenshots of actually displayed main and export-popover surfaces at the same physical footprint. The full original source is processed by the complete dither→halftone stack before shared GPU reduction. Fixed central opaque crop; no alignment search. WebP/CSS reconstruction error is measured, not claimed byte-identical. PNG1×/2× independently checks the common canonical raster.",
            source: {
              path: sourcePath,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              dimensions: sourceSize,
            },
            backend,
            environment,
            dpr,
            patternScale,
            poses,
            matchingZoom,
            pan,
            main: { bounds: main.bounds, clip: main.clip, pixels: main.pixels },
            preview: thumbnail,
            visible,
            encoded,
            exportIdentity,
            reads,
            errors,
          },
          (key, value) => (key === "dataUrl" ? undefined : value),
          2,
        ),
      );
      expect(visible.rgbMean).toBeLessThan(8);
      expect(encoded.rgbMean).toBeLessThan(8);
      expect(encoded.cornerAlpha).toBe(source.cornerAlpha);
      expect(errors).toEqual([]);
      expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      await inspection.close();
    });
