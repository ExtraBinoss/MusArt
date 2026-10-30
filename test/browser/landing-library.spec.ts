import { openProjectLibrary } from "./support/project-library";
import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("landing follows the app theme and its draggable showcase opens real templates", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?automation=1&welcome=1");
  const headline = page.getByRole("heading", { level: 1, name: "Créez. Animez." });
  await expect(headline).toBeVisible();
  await expect(page.locator(".landing-nav .landing-brand")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try MusArt", exact: true })).toBeVisible();
  await expect(page.locator(".landing-video-placeholder")).toHaveCount(4);
  await expect(page.locator(".landing-eyebrow")).toHaveCount(0);
  const light = await page
    .locator(".landing-page")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.locator(".landing-page").evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .not.toBe(light);
  await page.screenshot({ path: info.outputPath("landing-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".landing-page")).toHaveCSS("background-color", light);
  const carousel = page.locator(".landing-showcase-scroll");
  await carousel.hover();
  await page.mouse.wheel(620, 0);
  await expect.poll(() => carousel.getAttribute("data-carousel-position")).not.toBe("0");
  const before = await page.evaluate(() => window.musart!.snapshot().project.id);
  const bounds = await carousel.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width * 0.6, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.3, bounds!.y + bounds!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().project.id)).toBe(before);
  const story = page.getByRole("button", { name: "Créer depuis Story Instagram", exact: true });
  await story.focus();
  await story.click();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: window.musart!.snapshot().project.pages[0]!.width,
        height: window.musart!.snapshot().project.pages[0]!.height,
      })),
    )
    .toEqual({ width: 1080, height: 1920 });
});

test("library keeps five decoded recent thumbnails, a real Home action and Static/Motion filters", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const projects = Array.from({ length: 6 }, (_, index) =>
    createProject({
      id: `recent-${index}`,
      name: `Recent ${index}`,
      pages: [
        createPage({
          id: `recent-page-${index}`,
          width: 320,
          height: 240,
          layers: [
            createLayer("rectangle", {
              id: `recent-layer-${index}`,
              width: 320,
              height: 240,
              fill: ["#ec9778", "#a0bfa8", "#b3a2dc"][index % 3]!,
            }),
          ],
        }),
      ],
    }),
  );
  await page.evaluate(async (records) => {
    for (const project of records) {
      window.musart!.load(project);
      await window.musart!.save();
      await window.musart!.flushThumbnails();
    }
  }, projects);
  await openProjectLibrary(page);
  const sidebar = page.locator(".library-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Communauté · Bientôt", exact: true }),
  ).toBeDisabled();
  await expect(sidebar.locator(".library-recent-project")).toHaveCount(5);
  await expect
    .poll(() =>
      sidebar
        .locator(".library-recent-preview img")
        .evaluateAll(
          (images) =>
            images.length === 5 &&
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await sidebar.getByRole("button", { name: "Templates", exact: true }).click();
  const mode = page.getByRole("radiogroup", { name: "Mode du modèle" });
  await expect(mode.getByRole("radio", { name: "Statique", exact: true })).toBeChecked();
  await mode.getByRole("radio", { name: "Motion", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator(".template-artwork img")
        .evaluateAll(
          (images) =>
            images.length === 2 &&
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await expect(page.getByRole("searchbox", { name: "Rechercher un modèle" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".dashboard-pane-content").evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe("1");
  const gutter = await page.locator(".dashboard-pane").boundingBox();
  expect(Math.round(gutter!.x + gutter!.width)).toBe(1280);
  await page.screenshot({ path: info.outputPath("library-sidebar-motion.png") });
  await page.getByRole("button", { name: "Retour à l’accueil", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Créez. Animez." })).toBeVisible();
  await page.getByRole("button", { name: "Try MusArt", exact: true }).click();
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("button", { name: "Projets", exact: true }).click();
  await sidebar
    .getByRole("button", { name: "Ouvrir le projet récent Recent 5", exact: true })
    .click();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  expect(await page.evaluate(() => window.musart!.snapshot().project.id)).toBe("recent-5");
});
