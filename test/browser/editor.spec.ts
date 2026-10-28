import { test, expect, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Project } from "@musart/core";
async function ready(page: Page) {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.getByTestId("artboard")).toBeVisible();
}
async function load(page: Page, project: Project) {
  await page.evaluate((project) => window.musart!.load(project), project);
}
async function pixels(page: Page, options: { scale?: number; forceWebGL?: boolean } = {}) {
  return page.evaluate(async (options) => {
    const dataUrl = await window.musart!.render(options);
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  }, options);
}
test("workbench: real artwork, trackpad pan, anchored zoom, reset and recenter", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const result = await page.evaluate(() => window.musart!.render({ scale: 0.25 }));
  expect(result.startsWith("data:image/png")).toBeTruthy();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  const artboard = page.getByTestId("artboard"),
    canvas = page.getByTestId("editor-canvas");
  const initial = await artboard.getAttribute("data-zoom");
  await canvas.hover({ position: { x: 300, y: 200 } });
  await page.mouse.wheel(180, 100);
  await expect(artboard).toHaveAttribute("data-pan-x", "-90");
  await expect(artboard).toHaveAttribute("data-pan-y", "-50");
  await expect(artboard).toHaveAttribute("data-zoom", initial!);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -60);
  await page.keyboard.up("Control");
  await expect.poll(() => artboard.getAttribute("data-zoom")).not.toBe(initial);
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await expect(artboard).toHaveAttribute("data-zoom", "1");
  await expect(artboard).toHaveAttribute("data-pan-x", "0");
  await canvas.hover({ position: { x: 300, y: 200 } });
  await page.mouse.wheel(2000, 2000);
  await page.getByRole("button", { name: "Recentrer la vue", exact: true }).click();
  await expect(artboard).toHaveAttribute("data-pan-x", "0");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Rechercher dans MusArt", exact: true })
    .fill("ajuster écran");
  await page.getByRole("option", { name: /Ajuster à l’écran/ }).click();
  await page.screenshot({ path: "artifacts/screenshots/editor-light.png" });
  expect(errors).toEqual([]);
});
test("GPU TSL: dither/ASCII preserve alpha and export deterministically on WebGPU and WebGL fallback", async ({
  page,
}) => {
  await ready(page);
  const left = createLayer("rectangle", {
    id: "left",
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    fill: "#899cb4",
  });
  const right = createLayer("rectangle", {
    id: "right",
    x: 40,
    y: 0,
    width: 16,
    height: 16,
    fill: "#e53c3c",
  });
  await load(
    page,
    createProject({
      pages: [
        createPage({ width: 64, height: 40, background: "#00000000", layers: [left, right] }),
      ],
    }),
  );
  const baseline = await pixels(page, { forceWebGL: true });
  for (const forceWebGL of [false, true])
    for (const type of ["dither", "ascii"] as const) {
      await page.evaluate(
        (effect) =>
          window.musart!.execute({
            type: "updateLayers",
            ids: ["left"],
            patch: { effects: [effect] },
          }),
        createEffect(type, { amount: 1, scale: 4, levels: 2, seed: 42 }),
      );
      const output = await pixels(page, { forceWebGL });
      const pixel = (data: number[], x: number, y: number) =>
        data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4);
      expect(pixel(output.data, 44, 4)).toEqual(pixel(baseline.data, 44, 4));
      expect(pixel(output.data, 63, 39)[3]).toBe(0);
      expect(output.data).not.toEqual(baseline.data);
      expect((await pixels(page, { forceWebGL })).data).toEqual(output.data);
    }
  const high = await pixels(page, { scale: 2, forceWebGL: true });
  expect([high.width, high.height]).toEqual([128, 80]);
});
test("isolated group effect and non-destructive mask survive undo and reopen", async ({ page }) => {
  await ready(page);
  const group = createLayer("group", {
    id: "group",
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    effects: [createEffect("dither", { levels: 2, scale: 2, amount: 1 })],
  });
  const child = createLayer("rectangle", {
    id: "child",
    parentId: group.id,
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    fill: "#777777",
  });
  const other = createLayer("rectangle", {
    id: "other",
    x: 40,
    y: 0,
    width: 16,
    height: 16,
    fill: "#00ff00",
  });
  await load(
    page,
    createProject({
      name: "Grouped",
      pages: [
        createPage({
          width: 64,
          height: 40,
          background: "#00000000",
          layers: [group, child, other],
        }),
      ],
    }),
  );
  const output = await pixels(page, { forceWebGL: true });
  expect(output.data.slice((4 * 64 + 44) * 4, (4 * 64 + 44) * 4 + 4)).toEqual([0, 255, 0, 255]);
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["group"], patch: { visible: false } }),
  );
  const hidden = await pixels(page);
  expect(hidden.data[3]).toBe(0);
  await page.evaluate(() => window.musart!.undo());
  expect((await pixels(page, { forceWebGL: true })).data).toEqual(output.data);
  await page.evaluate(() => window.musart!.save());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
});
test("bulk import, pages, layers, history and portable/image exports through UI", async ({
  page,
}) => {
  await ready(page);
  const input = page
    .locator('input[type="file"]')
    .and(page.getByLabel("Importer des images", { exact: true }));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAQgAxNkAAAAASUVORK5CYII=",
    "base64",
  );
  const before = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers.length,
  );
  await input.setInputFiles(
    Array.from({ length: 15 }, (_, i) => ({
      name: `asset-${i}.png`,
      mimeType: "image/png",
      buffer: png,
    })),
  );
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(before + 15);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length)).toBe(
    before,
  );
  await page.evaluate(() => window.musart!.redo());
  expect(await page.evaluate(() => window.musart!.snapshot().selection.length)).toBe(15);
  await page.locator('.artboard-heading[data-active="true"]').hover();
  await page.getByTestId("canvas-add-artboard").click();
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages.length)).toBe(3);
  await page.getByRole("button", { name: "Exporter", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
test("magic wand worker creates an undoable image mask and export preserves its alpha", async ({
  page,
}) => {
  await ready(page);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><path fill="red" d="M0 0h40v40H0z"/><path fill="blue" d="M40 0h40v40H40z"/></svg>';
  const asset = {
    id: "two-colors",
    name: "Couleurs.svg",
    mime: "image/svg+xml",
    width: 80,
    height: 40,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
  const layer = createLayer("image", {
    id: "image",
    assetId: asset.id,
    x: 0,
    y: 0,
    width: 80,
    height: 40,
  });
  await load(
    page,
    createProject({
      pages: [createPage({ width: 80, height: 40, background: "#00000000", layers: [layer] })],
      assets: { [asset.id]: asset },
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Baguette magique", exact: true }).click();
  const box = await page.getByTestId("artboard").boundingBox();
  await page.mouse.click(box!.x + 10, box!.y + 20);
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.mask?.enabled),
    )
    .toBe(true);
  const masked = await pixels(page);
  expect(masked.data[(20 * 80 + 10) * 4 + 3]).toBe(255);
  expect(masked.data[(20 * 80 + 60) * 4 + 3]).toBe(0);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.mask),
  ).toBeNull();
  const original = await pixels(page);
  expect(original.data[(20 * 80 + 60) * 4 + 3]).toBe(255);
});
