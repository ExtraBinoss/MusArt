import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("collective selection preserves editable page guides, Escape cancellation and one undo", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layers = Array.from({ length: 100 }, (_, i) =>
    createLayer("rectangle", {
      id: `guide-item-${i}`,
      x: (i % 10) * 20,
      y: Math.floor(i / 10) * 15,
      width: 12,
      height: 10,
      ...(i === 0 ? { guides: [{ id: "local-retained", axis: "x", position: 4 }] } : {}),
    }),
  );
  const project = createProject({
    pages: [
      createPage({
        width: 320,
        height: 240,
        rulers: true,
        guides: [{ id: "collective-page", axis: "x", position: 100 }],
        layers,
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(project.pages[0]!.layers.map((layer) => layer.id));
  }, project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.locator(".canvas-selection-collective")).toHaveAttribute(
    "data-selection-count",
    "100",
  );
  await expect(page.locator(".layer-guides")).toHaveCount(0);
  const guide = page.locator('[data-guide-id="collective-page"]');
  await expect(guide).toBeVisible();
  const box = (await guide.boundingBox())!,
    start = { x: box.x + box.width / 2, y: box.y + 30 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  let snapshot = await page.evaluate(() => window.musart!.snapshot());
  expect(snapshot.canUndo).toBe(false);
  expect(snapshot.selection).toHaveLength(100);
  expect(snapshot.project.pages[0]!.guides[0]!.position).toBe(100);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y);
  await page.mouse.up();
  snapshot = await page.evaluate(() => window.musart!.snapshot());
  expect(snapshot.project.pages[0]!.guides[0]!.position).toBeGreaterThan(100);
  expect(snapshot.project.pages[0]!.layers[0]!.guides).toHaveLength(1);
  await page.keyboard.press("Control+z");
  snapshot = await page.evaluate(() => window.musart!.snapshot());
  expect(snapshot.canUndo).toBe(false);
  expect(snapshot.project.pages[0]!.guides[0]!.position).toBe(100);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("branded guide presets append one undoable frame and shared switches/select overflow use their actual surface", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const project = createProject({
    pages: [
      createPage({
        width: 1080,
        height: 1350,
        guides: [{ id: "keep-guide", axis: "x", position: 45 }],
        layers: [createLayer("rectangle", { id: "preset-target", width: 400, height: 300 })],
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const rulers = page.getByRole("switch", { name: "Afficher les règles", exact: true });
  await expect(rulers).toBeVisible();
  expect(await rulers.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await page.getByRole("button", { name: "Modèles", exact: true }).click();
  const presets = page.getByRole("dialog", { name: "Modèles de repères", exact: true });
  await expect(presets.locator("[data-guide-preset]")).toHaveCount(8);
  await expect(presets.locator(".guide-preset-name svg")).toHaveCount(8);
  await presets
    .getByRole("button", { name: "Ajouter les repères Publication Instagram", exact: true })
    .click();
  const state = await page.evaluate(() => window.musart!.snapshot());
  expect(state.project.pages[0]!.guides.map(({ axis, position }) => ({ axis, position }))).toEqual([
    { axis: "x", position: 45 },
    { axis: "x", position: 0 },
    { axis: "x", position: 1080 },
    { axis: "y", position: 135 },
    { axis: "y", position: 1215 },
  ]);
  expect(state.project.pages[0]!.width).toBe(1080);
  expect(state.project.pages[0]!.height).toBe(1350);
  await expect(page.locator(".guide-orientation h4")).toHaveText(["Verticaux", "Horizontaux"]);
  await expect(presets).toBeHidden();
  await expect(page.getByRole("button", { name: "Modèles", exact: true })).toBeFocused();
  await page.keyboard.press("Control+z");
  const undone = await page.evaluate(() => window.musart!.snapshot());
  expect(undone.project.pages[0]!.guides).toEqual(project.pages[0]!.guides);
  expect(undone.canUndo).toBe(false);
  await page.evaluate(() => window.musart!.select(["preset-target"]));
  await page.getByRole("combobox", { name: "Fusion", exact: true }).click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  const overflow = page.locator('[data-slot="select-scroll-down-button"]');
  await expect(overflow).toBeVisible();
  expect(await overflow.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    await menu.evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  await page.screenshot({ path: "artifacts/screenshots/guides-presets-select-surface.png" });
  await page.keyboard.press("Escape");
});
