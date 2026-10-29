import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

async function surfaceCommits(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
        ],
      ),
    ),
  );
}
test("workspace plus and empty-world quick add use real shared actions, native file selection and one-step edits", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          width: 640,
          height: 480,
          layers: [
            createLayer("rectangle", {
              id: "existing-card",
              name: "Existing card",
              x: 100,
              y: 100,
              width: 200,
              height: 100,
              fill: "#2563eb",
            }),
          ],
        }),
      ],
    }),
  );
  await expect(
    page.locator('[data-testid="artboard"] canvas[data-renderer-ready="true"]'),
  ).toBeVisible();
  const canvas = page.getByTestId("editor-canvas"),
    artboard = page.getByTestId("artboard"),
    open = async () => {
      await canvas.dblclick({ position: { x: 160, y: 120 } });
      await expect(page.getByRole("dialog", { name: "Ajout rapide", exact: true })).toBeVisible();
    };
  const addButton = page.getByTestId("canvas-add-artboard");
  await page.mouse.move(1590, 990);
  await expect(addButton).toHaveCSS("opacity", "0");
  await artboard.hover();
  await expect(addButton).toHaveCSS("opacity", "1");
  await page.mouse.move(1590, 990);
  await expect(addButton).toHaveCSS("opacity", "0");
  await addButton.focus();
  await expect(addButton).toHaveCSS("opacity", "1");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await addButton.hover();
  await expect(
    page.getByRole("tooltip", { name: "Ajouter un plan de travail", exact: true }),
  ).toBeVisible();
  await page.mouse.move(1590, 990);
  await page.keyboard.press("Tab");
  const options = page.locator('.artboard-heading[data-active="true"] .artboard-options');
  await options.focus();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await options.hover();
  await expect(
    page.getByRole("tooltip", { name: "Options du plan de travail", exact: true }),
  ).toBeVisible();
  await canvas.focus();
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  await open();
  const input = page.getByRole("combobox", { name: "Ajout rapide", exact: true });
  await expect(input).toBeFocused();
  const beforeQuery = await surfaceCommits(page);
  await input.fill("texte");
  expect(await surfaceCommits(page)).toEqual(beforeQuery);
  await page
    .getByRole("dialog", { name: "Ajout rapide", exact: true })
    .evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
  const popup = (await page
      .getByRole("dialog", { name: "Ajout rapide", exact: true })
      .boundingBox())!,
    area = (await canvas.boundingBox())!;
  expect(popup.x).toBeCloseTo(area.x + 160, 0);
  expect(popup.y).toBeGreaterThanOrEqual(area.y + 120);
  expect(popup.width).toBe(290);
  await page.screenshot({ path: "artifacts/screenshots/canvas-quick-add.png" });
  await page.getByRole("option", { name: "Texte", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(2);
  const added = await page.evaluate(() =>
    window.musart!.snapshot().project.pages[0]!.layers.at(-1)!,
  );
  expect(added).toEqual(
    expect.objectContaining({
      kind: "text",
      x: 140,
      y: 190,
      width: 360,
      height: 100,
      fontSize: 48,
    }),
  );
  expect(added.text.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
  await expect(page.locator(".quick-add-popover")).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(1);
  const board = (await artboard.boundingBox())!;
  await page.mouse.dblclick(board.x + 150, board.y + 150);
  await expect(page.getByRole("dialog", { name: "Ajout rapide", exact: true })).toBeHidden();
  await page.mouse.dblclick(board.x + 20, board.y + 20);
  await expect(page.getByRole("dialog", { name: "Ajout rapide", exact: true })).toBeHidden();
  await open();
  const chooseImage = page.waitForEvent("filechooser");
  await page.getByRole("option", { name: "Importer des images", exact: true }).click();
  await (await chooseImage).setFiles("apps/web/public/branding/musart-icon-32.png");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.musart!.snapshot().project.pages[0]!.layers.some((layer) => layer.kind === "image"),
      ),
    )
    .toBe(true);
  await expect(
    page.locator('[data-testid="artboard"] canvas[data-renderer-ready="true"]'),
  ).toBeVisible();
  await expect(page.locator(".quick-add-popover")).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(1);
  await open();
  await page.getByRole("option", { name: "Forme", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ajout rapide", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Icônes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marques", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('.artboard-heading[data-active="true"]').hover();
  await page.getByRole("button", { name: "Ajouter un plan de travail", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
    .toBe(2);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
    .toBe(1);
  await open();
  await page.evaluate(() => {
    const project = window.musart!.snapshot().project;
    project.id = "replacement-project";
    window.musart!.load(project);
  });
  await expect(page.getByRole("dialog", { name: "Ajout rapide", exact: true })).toBeHidden();
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/canvas-quick-add.json",
    JSON.stringify(
      { browser: page.context().browser()!.version(), beforeQuery, popup, added, reads },
      null,
      2,
    ),
  );
});
