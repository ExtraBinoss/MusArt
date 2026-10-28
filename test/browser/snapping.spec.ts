import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";
const project = createProject({
  name: "Smart snapping",
  pages: [
    createPage({
      width: 200,
      height: 160,
      layers: [
        createLayer("rectangle", {
          id: "moving",
          name: "Moving",
          x: 10,
          y: 10,
          width: 20,
          height: 20,
          fill: "#e99b42",
        }),
        createLayer("rectangle", {
          id: "target",
          name: "Target",
          x: 100,
          y: 80,
          width: 20,
          height: 20,
          fill: "#739bff",
        }),
      ],
      guides: [{ id: "manual", axis: "x", position: 65, color: "#f25cb5" }],
    }),
  ],
});
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const d = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')?.dataset;
    return d?.rendererReady === "true" && d.sceneRevision === d.renderedRevision;
  });
}
async function position(page: Page, x: number, y: number) {
  const element = page.getByTestId("artboard"),
    box = (await element.boundingBox())!,
    size = await element.evaluate((node) => ({
      width: (node as HTMLElement).offsetWidth,
      height: (node as HTMLElement).offsetHeight,
    }));
  return { x: box.x + (x * box.width) / size.width, y: box.y + (y * box.height) / size.height };
}
async function move(page: Page, x: number, y: number) {
  const p = await position(page, x, y);
  await page.mouse.move(p.x, p.y);
}
async function reset(page: Page, zoom: number) {
  await page.evaluate((value) => window.musart!.load(value), project);
  await ready(page);
  await move(page, 20, 20);
  await zoomViewport(page, zoom);
}
async function commits(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => [
          selector,
          document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
        ],
      ),
    ),
  );
}
async function currentX(page: Page) {
  return page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.x);
}
async function searchAction(page: Page, query: string, label: string) {
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Rechercher dans MusArt", exact: true }).fill(query);
  await page.getByRole("option", { name: new RegExp(label) }).click();
}
test("actual move/resize snapping uses screen tolerance, honest cues, persisted enable state and one undo commit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "musart.snapping.v1",
      JSON.stringify({ version: 1, enabled: true, threshold: 6 }),
    ),
  );
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const evidence: unknown[] = [];
  for (const zoom of [1, 2]) {
    await reset(page, zoom);
    await move(page, 20, 20);
    await page.mouse.down();
    await expect(page.locator('[data-layer-id="moving"].canvas-selection')).toHaveCount(1);
    const before = await commits(page);
    await move(page, 87, 20);
    await expect(page.locator('[data-snap-axis="x"][data-snap-target="target"]')).toHaveCount(1);
    expect(await currentX(page)).toBe(10);
    expect(await commits(page)).toEqual(before);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: `artifacts/snapping-${zoom}x.png` });
    await page.mouse.up();
    expect(await currentX(page)).toBe(80);
    await expect(page.locator(".canvas-snap-line")).toHaveCount(0);
    await page.evaluate(() => window.musart!.undo());
    expect(await currentX(page)).toBe(10);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    evidence.push({ zoom, committedX: 80, screenCorrection: 3 * zoom });
  }
  // Four document pixels are eight screen pixels at 200%, outside the six-pixel attraction zone.
  await reset(page, 2);
  await move(page, 20, 20);
  await page.mouse.down();
  await move(page, 86, 20);
  await expect(page.locator('[data-snap-axis="x"]')).toHaveCount(0);
  await page.mouse.up();
  expect(await currentX(page)).toBeCloseTo(76, 6);
  await reset(page, 1);
  await move(page, 20, 20);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  await move(page, 87, 20);
  await expect(page.locator(".canvas-snap-line")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  expect(await currentX(page)).toBeCloseTo(77, 6);
  await searchAction(page, "désactiver magnétisme", "Désactiver le magnétisme");
  await reset(page, 1);
  await move(page, 20, 20);
  await page.mouse.down();
  await move(page, 87, 20);
  await page.mouse.up();
  expect(await currentX(page)).toBeCloseTo(77, 6);
  await searchAction(page, "activer magnétisme", "^Activer le magnétisme");
  await reset(page, 1);
  await page.evaluate(() => window.musart!.select(["moving"]));
  const handle = page.locator('[data-layer-id="moving"][data-handle="se"]');
  await handle.hover();
  await page.mouse.down();
  await move(page, 62, 43);
  await expect(page.locator('[data-snap-target="manual"]')).toHaveCount(1);
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.width),
  ).toBe(55);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect(reads.gpu + reads.webgl + reads.canvas).toBe(0);
  expect(errors).toEqual([]);
  await writeFile("artifacts/snapping.json", JSON.stringify({ evidence, reads, errors }, null, 2));
});
