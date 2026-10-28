import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("export popover previews and encodes only the selected masked child, or the complete artboard", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const project = createProject({
    pages: [
      createPage({
        width: 400,
        height: 300,
        background: "#2244ff",
        layers: [
          createLayer("group", {
            id: "g",
            name: "Parent",
            x: 70,
            y: 60,
            width: 160,
            height: 140,
            opacity: 0.5,
          }),
          createLayer("rectangle", {
            id: "c",
            name: "Selected child",
            parentId: "g",
            x: 20,
            y: 30,
            width: 100,
            height: 60,
            fill: "#ff0000",
            mask: { layerId: "m", enabled: true, inverted: false },
          }),
          createLayer("rectangle", {
            id: "m",
            name: "Mask",
            maskSource: true,
            x: 90,
            y: 90,
            width: 50,
            height: 60,
            fill: "#ffffff",
          }),
          createLayer("rectangle", {
            id: "other",
            x: 280,
            y: 200,
            width: 40,
            height: 40,
            fill: "#00ff00",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["c"]);
  }, project);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await expect(popover).toBeVisible();
  await expect(popover.getByText("100 × 60", { exact: false })).toBeVisible();
  const preview = popover.getByRole("img", { name: "Aperçu de l’export", exact: true });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await popover.locator(".export-preview").hover();
  await popover.getByRole("button", { name: "Agrandir l’aperçu", exact: true }).click();
  await expect(preview).toBeVisible();
  await preview.evaluate((image: HTMLImageElement) => image.decode());
  const overflow = await popover.locator(".export-preview").evaluate((element) => ({
    x: element.scrollWidth > element.clientWidth,
    y: element.scrollHeight > element.clientHeight,
  }));
  expect(overflow).toEqual({ x: true, y: true });
  const popupBounds = (await popover.boundingBox())!;
  const submitBounds = (await popover
    .getByRole("button", { name: "Exporter l’image", exact: true })
    .boundingBox())!;
  expect(submitBounds.x + submitBounds.width).toBeLessThanOrEqual(
    popupBounds.x + popupBounds.width,
  );
  await popover.getByRole("button", { name: "Ajuster l’aperçu", exact: true }).click();
  await expect(preview).toBeVisible();
  await preview.evaluate((image: HTMLImageElement) => image.decode());
  await page.screenshot({ path: "artifacts/screenshots/export-selected-layer.png" });
  async function downloadPixels() {
    const waiting = page.waitForEvent("download");
    await popover.getByRole("button", { name: "Exporter l’image", exact: true }).click();
    const download = await waiting,
      file = await download.path();
    if (!file) throw new Error("Missing delivered image");
    const url = `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
    const inspector = await page.context().newPage();
    try {
      return await inspector.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const sample = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
        return {
          width: image.width,
          height: image.height,
          left: sample(20, 20),
          right: sample(Math.floor(image.width * 0.75), 20),
          corner: sample(5, 5),
        };
      }, url);
    } finally {
      await inspector.close();
    }
  }
  const selected = await downloadPixels();
  expect([selected.width, selected.height]).toEqual([100, 60]);
  expect(selected.left.slice(0, 3)).toEqual([255, 0, 0]);
  expect(selected.left[3]).toBeGreaterThanOrEqual(127);
  expect(selected.left[3]).toBeLessThanOrEqual(129);
  expect(selected.right[3]).toBe(0);
  await expect(popover).toBeHidden();
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await popover.getByRole("switch", { name: "Plan de travail entier", exact: true }).click();
  await expect(popover.getByText("400 × 300", { exact: false })).toBeVisible();
  const complete = await downloadPixels();
  expect([complete.width, complete.height]).toEqual([400, 300]);
  expect(complete.corner).toEqual([34, 68, 255, 255]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    gpuHook: true,
    canvasHook: true,
  });
});
