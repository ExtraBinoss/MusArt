import { test, expect, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function ready(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const document = createProject({
    name: "Search studio",
    pages: [
      createPage({
        id: "search-cover",
        name: "Couverture",
        width: 600,
        height: 500,
        layers: [
          createLayer("rectangle", {
            id: "search-shape",
            name: "Cadre bleu",
            x: 70,
            y: 70,
            width: 200,
            height: 150,
            fill: "#2463eb",
          }),
        ],
      }),
      createPage({
        id: "search-story",
        name: "Story",
        width: 600,
        height: 500,
        layers: [
          createLayer("text", {
            id: "search-title",
            name: "Été à Paris",
            text: "Summer",
            x: 70,
            y: 80,
            width: 300,
            height: 100,
          }),
        ],
      }),
    ],
  });
  await page.evaluate((document) => window.musart!.load(document), document);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await choose(page, "fit canvas", /Ajuster à l’écran/);
}
async function search(page: Page, query: string) {
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Rechercher dans MusArt", exact: true });
  await expect(input).toBeFocused();
  await input.fill(query);
  return input;
}
async function choose(page: Page, query: string, label: RegExp) {
  await search(page, query);
  await page.getByRole("option", { name: label }).click();
  await expect(
    page.getByRole("dialog", { name: "Rechercher dans MusArt", exact: true }),
  ).toBeHidden();
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
}
test("spotlight keyboard navigation, cross-page layers, effect undo and help use actual editor actions", async ({
  page,
}) => {
  await ready(page);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await search(page, "");
  await page.getByRole("button", { name: "Édition", exact: true }).click();
  await expect(page.getByRole("option", { name: /Dupliquer/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Rechercher dans MusArt", exact: true })
    .fill("ete paris");
  await expect(page.getByRole("option", { name: /Été à Paris/ })).toHaveAttribute(
    "data-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual(["search-title"]);
  expect(await page.evaluate(() => window.musart!.snapshot().pageId)).toBe("search-story");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision);
  await choose(page, "dither", /^Dither/);
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[0]!.effects[0]?.type),
    )
    .toBe("dither");
  await page.keyboard.press("Control+z");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[0]!.effects),
  ).toEqual([]);
  const input = await search(page, "baguette");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Baguette magique", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await search(page, "none-zzzz");
  await expect(
    page.getByText("Aucun résultat. Essayez un autre mot ou une autre catégorie."),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(input).toBeHidden();
  await choose(page, "shortcuts", /Raccourcis clavier/);
  await expect(page.getByRole("dialog", { name: "Raccourcis clavier", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/keyboard-shortcuts.png" });
  await page.keyboard.press("Escape");
  await search(page, "");
  await page.screenshot({ path: "artifacts/screenshots/magic-search.png" });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
test("spotlight hands off real file pickers and opens settings/new/export dialogs after closing", async ({
  page,
}) => {
  await ready(page);
  await search(page, "import images");
  const imagePicker = page.waitForEvent("filechooser");
  await page.getByRole("option", { name: /Importer des images/ }).click();
  await (await imagePicker).setFiles("apps/web/public/benchmark/01-forest-1.jpg");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(2);
  await search(page, "svg");
  const svgPicker = page.waitForEvent("filechooser");
  await page.getByRole("option", { name: /^Importer un SVG/ }).click();
  await (
    await svgPicker
  ).setFiles({
    name: "triangle.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#ee3355" d="M0 100L50 0L100 100Z"/></svg>',
    ),
  });
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(3);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.at(-1)!.kind),
  ).toBe("vector");
  await choose(page, "dark theme", /thème sombre/);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await search(page, "");
  await page.screenshot({ path: "artifacts/screenshots/magic-search-dark.png" });
  await page.keyboard.press("Escape");
  await choose(page, "settings", /^Préférences/);
  await expect(page.getByRole("heading", { name: "Préférences", exact: true })).toBeVisible();
  expect(await page.getByRole("dialog").count()).toBe(1);
  await page.keyboard.press("Escape");
  await choose(page, "new project", /^Nouveau projet/);
  const creation = page.getByRole("dialog", {
    name: "Un nouvel espace pour vos idées.",
    exact: true,
  });
  await expect(creation).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await expect(creation.getByRole("textbox", { name: "Nom", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(creation).toBeHidden();
  const dashboard = page.getByRole("dialog", { name: "Tableau de bord MusArt", exact: true });
  await expect(dashboard).toBeHidden();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await choose(page, "png", /^Exporter/);
  await expect(
    page.getByRole("dialog", { name: "Exporter la composition", exact: true }),
  ).toBeVisible();
  expect(await page.getByRole("dialog").count()).toBe(1);
});
