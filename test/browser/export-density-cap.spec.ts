import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test.use({ deviceScaleFactor: 3 });
for (const forceWebGL of [false, true])
  test(`Tiny export preview matches its actual backing density at DPR3 (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    await installReadbackProbe(page);
    if (forceWebGL)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const layer = createLayer("rectangle", {
        id: "tiny-image",
        x: 24,
        y: 24,
        width: 16,
        height: 16,
        fill: "#aabbaa",
        effects: [createEffect("dither", { scale: 1 })],
      }),
      project = createProject({
        pages: [createPage({ width: 320, height: 320, layers: [layer] })],
      });
    await page.evaluate((project) => {
      window.musart!.load(project);
      window.musart!.select(["tiny-image"]);
    }, project);
    await page.locator(".export-trigger").click();
    const preview = page.locator(".export-preview img");
    await expect(preview).toBeVisible();
    await preview.evaluate((image) => (image as HTMLImageElement).decode());
    await page.locator(".export-dialog").evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const footprint = () =>
      preview.evaluate((element) => {
        const image = element as HTMLImageElement,
          rect = image.getBoundingClientRect();
        return {
          natural: [image.naturalWidth, image.naturalHeight],
          physical: [
            Math.round(rect.width * devicePixelRatio),
            Math.round(rect.height * devicePixelRatio),
          ],
        };
      });
    const fit = await footprint();
    expect(fit).toEqual({ natural: [128, 128], physical: [128, 128] });
    await page.getByRole("button", { name: /^(Agrandir l’aperçu|Enlarge preview)$/ }).click();
    await expect.poll(footprint).toEqual({ natural: [128, 128], physical: [128, 128] });
    const expanded = await footprint(),
      suffix = forceWebGL ? "webgl" : "webgpu";
    await mkdir("artifacts/export-density", { recursive: true });
    await preview.screenshot({ path: `artifacts/export-density/${suffix}-visible.png` });
    const reads = await page.evaluate(() => window.__musartVideoReadbacks);
    expect({ gpu: reads?.gpu, webgl: reads?.webgl, canvas: reads?.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    await writeFile(
      `artifacts/export-density/${suffix}.json`,
      JSON.stringify({ fit, expanded, reads }, null, 2),
    );
  });
