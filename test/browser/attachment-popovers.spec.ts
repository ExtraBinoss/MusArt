import { expect, test, type Page, type Locator } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { inspectImage } from "./support/image-probe";

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
}
async function quietAutofocus(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByRole("tooltip")).toHaveCount(0);
}
async function settledPopover(popover: Locator) {
  await popover.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}
async function closePopover(page: Page, popover: Locator, trigger: Locator) {
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();
}
async function begin(page: Page, gradient = true) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const mask = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL("image/png");
  });
  const effects = gradient
    ? [
        createEffect("dither", { id: "tooltip-dither" }),
        createEffect("gradient", { id: "tooltip-gradient" }),
      ]
    : [createEffect("grain", { id: "tooltip-grain", amount: 0.8, seed: 42 })];
  const layer = createLayer("rectangle", {
    id: "tooltip-owner",
    name: "Tooltip owner",
    width: 240,
    height: 180,
    fill: "#778899",
    effects,
    mask: { assetId: "tooltip-mask", enabled: true, inverted: false, mode: "alpha" },
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["tooltip-owner"]);
    },
    createProject({
      name: "Attachment controls",
      pages: [createPage({ width: 320, height: 240, layers: [layer] })],
      assets: {
        "tooltip-mask": {
          id: "tooltip-mask",
          name: "Opaque mask",
          width: 8,
          height: 8,
          mime: "image/png",
          dataUrl: mask,
        },
      },
    }),
  );
  await ready(page);
  return page.locator('[data-layer-id="tooltip-owner"]');
}

test("effect, mask, export and color popovers keep real autofocus without phantom tooltips; deliberate hover remains available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const row = await begin(page);
  const dither = row.locator('[data-attachment-effect-id="tooltip-dither"]');
  await dither.click();
  const effects = page.getByRole("dialog", { name: "Effets · Tooltip owner", exact: true });
  const eye = effects.getByRole("button", { name: "Désactiver l’effet", exact: true });
  await expect(eye).toBeFocused();
  await quietAutofocus(page);
  await eye.hover();
  await expect(
    page.getByRole("tooltip", { name: "Désactiver l’effet", exact: true }),
  ).toBeVisible();
  await page.mouse.move(10, 10);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await closePopover(page, effects, dither);
  await page.keyboard.press("Enter");
  await expect(eye).toBeFocused();
  await quietAutofocus(page);
  await closePopover(page, effects, dither);
  const maskTrigger = row.locator('[data-attachment-target="mask"]');
  await maskTrigger.click();
  const mask = page.getByRole("dialog", { name: "Masque · Tooltip owner", exact: true });
  await expect(mask.getByRole("button", { name: "Inverser le masque", exact: true })).toBeFocused();
  await quietAutofocus(page);
  await closePopover(page, mask, maskTrigger);
  const exportTrigger = page.getByRole("button", { name: "Exporter", exact: true });
  await exportTrigger.click();
  const exporting = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await expect(exporting).toBeVisible();
  expect(await exporting.evaluate((element) => element.contains(document.activeElement))).toBe(
    true,
  );
  await quietAutofocus(page);
  await closePopover(page, exporting, exportTrigger);
  const gradientTrigger = row.locator('[data-attachment-effect-id="tooltip-gradient"]');
  await gradientTrigger.click();
  await expect(effects).toBeVisible();
  await settledPopover(effects);
  await quietAutofocus(page);
  const colorTrigger = effects.getByRole("button", { name: "Couleur 1", exact: true });
  await colorTrigger.click();
  const color = page.getByRole("dialog", { name: "Sélecteur de couleur · Couleur 1", exact: true });
  await expect(color).toBeVisible();
  expect(await color.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await quietAutofocus(page);
  await closePopover(page, color, colorTrigger);
  await closePopover(page, effects, gradientTrigger);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await dither.click();
  await expect(eye).toBeFocused();
  await quietAutofocus(page);
  await eye.hover();
  await expect(
    page.getByRole("tooltip", { name: "Désactiver l’effet", exact: true }),
  ).toBeVisible();
  await page.mouse.move(10, 10);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});

test("complete effect controls keep matching heights, real seed pixels and undo, and a scrollable longest Gradient popover", async ({
  page,
}) => {
  const row = await begin(page, false);
  const grainTrigger = row.locator('[data-attachment-effect-id="tooltip-grain"]');
  await grainTrigger.click();
  const popover = page.getByRole("dialog", { name: "Effets · Tooltip owner", exact: true });
  await settledPopover(popover);
  const sizes = await popover.locator(".effect-compositing").evaluate((element) => ({
    opacity: element.querySelector(".number-field")!.getBoundingClientRect().height,
    blend: element.querySelector('[data-slot="select-trigger"]')!.getBoundingClientRect().height,
  }));
  expect(sizes.opacity).toBe(34);
  expect(sizes.blend).toBe(sizes.opacity);
  const before = await page.evaluate(async () => ({
    revision: window.musart!.snapshot().revision,
    png: await window.musart!.render({ scale: 1, format: "png" }),
  }));
  const seed = popover.getByRole("textbox", { name: "Graine", exact: true });
  await seed.fill("145");
  await seed.press("Enter");
  await ready(page);
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.seed,
    ),
  ).toBe(145);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision + 1);
  const after = await page.evaluate(() => window.musart!.render({ scale: 1, format: "png" }));
  const region = [{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }];
  const sourcePixels = await inspectImage(page, before.png, region),
    changedPixels = await inspectImage(page, after, region);
  expect(sourcePixels.regions[0]!.hash).not.toBe(changedPixels.regions[0]!.hash);
  await page.bringToFront();
  await closePopover(page, popover, grainTrigger);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.seed,
    ),
  ).toBe(42);
  await page.setViewportSize({ width: 1200, height: 650 });
  await page.evaluate(
    (effect) =>
      window.musart!.execute({
        type: "updateLayers",
        ids: ["tooltip-owner"],
        patch: { effects: [effect] },
      }),
    createEffect("gradient", {
      id: "long-gradient",
      settings: { preset: "custom", treatment: "blocks", colorCount: 6 },
    }),
  );
  const longTrigger = row.locator('[data-attachment-effect-id="long-gradient"]');
  await longTrigger.click();
  await expect(popover).toBeVisible();
  await settledPopover(popover);
  const viewport = popover.locator(".layer-attachment-viewport");
  const layout = await viewport.evaluate((element) => {
    const box = element.closest('[data-slot="popover-content"]')!.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      height: box.height,
      viewportHeight: innerHeight,
      overflow: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.height).toBeLessThanOrEqual(600);
  expect(layout.overflow).toBe("auto");
  expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight * 2);
  await popover
    .getByRole("textbox", { name: "Rotation du traitement", exact: true })
    .scrollIntoViewIfNeeded();
  expect(await viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(
    popover.getByRole("textbox", { name: "Rotation du traitement", exact: true }),
  ).toBeVisible();
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/effect-popover-long-parameters.png" });
  await closePopover(page, popover, longTrigger);
  await page.evaluate(
    (effect) =>
      window.musart!.execute({
        type: "updateLayers",
        ids: ["tooltip-owner"],
        patch: { effects: [effect] },
      }),
    createEffect("gradient", {
      id: "stripe-palette",
      settings: { preset: "custom", style: "stripes", colorCount: 2 },
    }),
  );
  const stripeTrigger = row.locator('[data-attachment-effect-id="stripe-palette"]');
  await stripeTrigger.click();
  await settledPopover(popover);
  await expect(popover.getByRole("textbox", { name: "Couleurs", exact: true })).toHaveCount(0);
  const stripeBefore = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    color: window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.color2,
  }));
  const stripeColorTrigger = popover.getByRole("button", { name: "Couleur 3", exact: true });
  await stripeColorTrigger.click();
  const color = page.getByRole("dialog", { name: "Sélecteur de couleur · Couleur 3", exact: true });
  const hexadecimal = color.getByRole("textbox", { name: "Couleur hexadécimale", exact: true });
  await hexadecimal.fill("#00ff00");
  await hexadecimal.press("Enter");
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.color2,
    ),
  ).toBe("#00ff00");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(
    stripeBefore.revision + 1,
  );
  await closePopover(page, color, stripeColorTrigger);
  await closePopover(page, popover, stripeTrigger);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.color2,
    ),
  ).toBe(stripeBefore.color);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await writeFile(
    "artifacts/effect-popover-controls.json",
    JSON.stringify({ sizes, layout, sourcePixels, changedPixels }, null, 2),
  );
});
