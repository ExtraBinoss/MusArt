import { openProjectLibrary } from "./support/project-library";
import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const metricSelectors = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
async function counters(page: Page) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          document.querySelector(selector)?.getAttribute("data-react-renders"),
        ]),
      ),
    metricSelectors,
  );
}
async function loadWitness(page: Page, rulers = false) {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["mobile-witness"]);
    },
    createProject({
      id: "mobile-project",
      name: "Mobile witness",
      pages: [
        createPage({
          id: "mobile-page",
          width: 640,
          height: 480,
          rulers,
          layers: [
            createLayer("rectangle", {
              id: "mobile-witness",
              name: "Coral rectangle",
              x: 120,
              y: 100,
              width: 240,
              height: 160,
              fill: "#e7967a",
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
}

test("mobile landing, project library, presets and creation lead to the full-width editor", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Créez. Animez." })).toBeVisible();
  await expect(page.getByText("Aperçu vidéo à venir")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath("mobile-landing.png") });
  await page.getByRole("button", { name: "Commencer à créer" }).first().click();
  await expect(
    page.locator(".mobile-library-nav").getByRole("button", { name: "Projets", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .locator(".mobile-library-nav")
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await expect(page.locator(".template-card").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".template-artwork img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.getByRole("searchbox", { name: "Rechercher un modèle" }).fill("instagram");
  await expect(page.locator(".template-card")).toHaveCount(4);
  await page
    .locator(".mobile-library-nav")
    .getByRole("button", { name: "Projets", exact: true })
    .click();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  const creation = page.getByRole("dialog", { name: "Un nouvel espace pour vos idées." });
  await expect(creation.getByLabel("Fond", { exact: true })).toHaveCount(0);
  await creation.getByLabel("Nom", { exact: true }).fill("Mon premier projet");
  await creation.getByLabel("Largeur", { exact: true }).fill("1200");
  await creation.getByLabel("Hauteur", { exact: true }).fill("800");
  await creation.getByRole("button", { name: "Lier les proportions", exact: true }).click();
  await creation.getByLabel("Largeur", { exact: true }).fill("600");
  await expect(creation.getByLabel("Hauteur", { exact: true })).toHaveValue("400");
  await page.screenshot({ path: info.outputPath("mobile-creation.png") });
  await creation.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);
  const box = await page.getByTestId("editor-canvas").boundingBox();
  expect(box!.width).toBe(390);
  expect(box!.height).toBeGreaterThan(700);
  const projectLabel = page.getByRole("button", { name: "Actions du projet", exact: true });
  const beforeLogo = await projectLabel.textContent();
  await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Un nouvel espace pour vos idées." })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(projectLabel).toHaveText(beforeLogo!);
  await openProjectLibrary(page);
  await expect(page.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Rechercher un projet" })).toBeVisible();
});

test("mobile property gestures keep canonical state and canvas React commits stable until one undoable release", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installReadbackProbe(page);
  await loadWitness(page);
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "Propriétés", exact: true }).click();
  const rotation = page.getByRole("slider", { name: "Régler Rotation", exact: true });
  await rotation.scrollIntoViewIfNeeded();
  await expect(rotation).toBeVisible();
  const before = await counters(page);
  await rotation.focus();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await expect(page.locator("[data-mobile-adjusting]")).toHaveCount(1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
  ).toBe(0);
  expect(await counters(page)).toEqual(before);
  await expect
    .poll(() =>
      page.locator(".mobile-sheet").evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: info.outputPath("mobile-adjusting.png") });
  await page.keyboard.press("Escape");
  await page.keyboard.up("ArrowRight");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
  ).toBe(0);
  expect(await counters(page)).toEqual(before);
  await expect(page.locator(".mobile-sheet")).toBeVisible();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
    )
    .toBe(2);
  await page.evaluate(() => window.musart!.undo());
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
    )
    .toBe(0);
  await page.evaluate(() => window.musart!.redo());
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
    )
    .toBe(2);
  await page.getByRole("button", { name: "Fermer le panneau" }).click();
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "Calques", exact: true }).click();
  await expect(page.getByRole("tree", { name: "Calques", exact: true })).toBeVisible();
  const handle = page.getByRole("button", { name: "Glisser vers le bas pour fermer" });
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2 + 130, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("mobile Layers keeps one heading and centers compositing with empty and multiple selections", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await loadWitness(page);
  await page.evaluate(
    (layer) => {
      const project = window.musart!.snapshot().project;
      project.pages[0]!.layers.push(layer);
      window.musart!.load(project);
      window.musart!.select([]);
    },
    createLayer("rectangle", {
      id: "mobile-second",
      name: "Second rectangle",
      x: 20,
      y: 30,
      width: 60,
      height: 70,
    }),
  );
  await page.getByRole("button", { name: "Calques", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Calques", exact: true });
  const header = sheet.locator(".mobile-sheet-header");
  await expect(sheet.getByRole("heading", { name: "Calques", exact: true })).toHaveCount(1);
  await expect(sheet.locator(".layers-panel > .panel-heading")).toHaveCount(0);
  await expect(header.locator(".small-count")).toHaveText("2");
  await expect(sheet.locator(".layers-header-actions")).toHaveCount(1);
  await expect(header.locator(".layers-header-actions")).toHaveCount(1);
  const blend = sheet.getByRole("combobox", { name: "Fusion", exact: true });
  for (const ids of [[], ["mobile-witness"], ["mobile-witness", "mobile-second"]]) {
    await page.evaluate((selection) => window.musart!.select(selection), ids);
    if (ids.length) await expect(blend).toBeEnabled();
    else await expect(blend).toBeDisabled();
    await expect
      .poll(() =>
        sheet.locator(".layer-compositing").evaluate((node) => {
          const opacity = node.firstElementChild!.getBoundingClientRect();
          const select = node
            .querySelector('[data-slot="select-trigger"]')!
            .getBoundingClientRect();
          return Math.abs(opacity.top + opacity.height / 2 - select.top - select.height / 2);
        }),
      )
      .toBeLessThan(1);
    await sheet.screenshot({ path: info.outputPath(`layers-${ids.length}-selected.png`) });
  }
});

test("native mobile slider drags preserve layout and commit one reversible edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installReadbackProbe(page);
  await loadWitness(page);
  await page.getByRole("button", { name: "Propriétés", exact: true }).click();
  const rotation = page.getByRole("slider", { name: "Régler Rotation", exact: true });
  await rotation.scrollIntoViewIfNeeded();
  const row = page.locator(".mobile-number-field").filter({ has: rotation });
  const track = await row.locator('[data-slot="slider"]').boundingBox();
  const layoutBefore = await row.boundingBox();
  const pointerBefore = await counters(page);
  await page.mouse.move(track!.x + track!.width * 0.6, track!.y + track!.height / 2);
  await page.mouse.down();
  await page.mouse.move(track!.x + track!.width * 0.7, track!.y + track!.height / 2, { steps: 6 });
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
  ).toBe(0);
  expect(await counters(page)).toEqual(pointerBefore);
  expect(await row.boundingBox()).toEqual(layoutBefore);
  await page.mouse.up();
  const authored = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation,
  );
  expect(authored).not.toBe(0);
  await page.evaluate(() => window.musart!.undo());
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
    )
    .toBe(0);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("native two-finger navigation zooms and pans the canvas without document edits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadWitness(page);
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  const originalZoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 135, y: 250, id: 1 },
      { x: 255, y: 250, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 75, y: 280, id: 1 },
      { x: 315, y: 280, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect
    .poll(async () => Number(await page.getByTestId("artboard").getAttribute("data-zoom")))
    .toBeCloseTo(originalZoom * 2, 2);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
  await cdp.detach();
});

test("mobile Motion and tools remain usable inside their sheets", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadWitness(page);
  await page.getByRole("button", { name: "Outils", exact: true }).click();
  const tools = page.locator(".mobile-sheet .toolbar-contents");
  await expect(tools).toBeVisible();
  expect((await tools.boundingBox())!.width).toBeGreaterThan(300);
  await expect(
    tools.getByRole("button", { name: "Importer des images", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Passer en mode Motion", exact: true }).click();
  await expect(page.locator(".mobile-motion-panel .motion-timeline")).toBeVisible();
  const toolbar = await page.locator(".motion-compact-toolbar").boundingBox();
  expect(toolbar!.x).toBeGreaterThanOrEqual(0);
  expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(390);
  await expect(page.locator(".motion-scroll-shadow")).toHaveAttribute("data-overflow-right", "");
  await expect(page.locator(".motion-timeline")).toHaveCSS("--motion-gutter", "120px");
  const ruler = page.getByRole("slider", { name: "Se déplacer dans la timeline", exact: true });
  await ruler.focus();
  await page.keyboard.press("End");
  await expect(ruler).toHaveAttribute("aria-valuenow", "2");
  await page.keyboard.press("Home");
  await expect(ruler).toHaveAttribute("aria-valuenow", "0");
  await page.screenshot({ path: info.outputPath("mobile-motion.png") });
  await page.getByRole("button", { name: "Fermer le panneau" }).click();
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Exporter la composition" })).toBeVisible();
  await expect(page.locator(".mobile-sheet-export")).toBeVisible();
});
