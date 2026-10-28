import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function ready(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "Keyboard studio",
      pages: [
        createPage({
          name: "Keyboard cover",
          width: 640,
          height: 480,
          layers: Array.from({ length: 24 }, (_, index) =>
            createLayer("rectangle", {
              id: `keyboard-layer-${index}`,
              name: `Keyboard rectangle ${index}`,
              x: 10 + index * 12,
              y: 25 + index * 8,
              width: 80,
              height: 60,
            }),
          ),
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
}
const searchDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Rechercher dans MusArt", exact: true });
async function opening(page: Page) {
  await page.keyboard.press("Control+k");
  const dialog = searchDialog(page);
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await expect(dialog).toHaveAttribute("data-open-paint-upper-bound-ms", /\d/);
  return dialog.evaluate((element) => ({
    paintUpperBoundMs: Number((element as HTMLElement).dataset.openPaintUpperBoundMs),
    catalogSize: Number((element as HTMLElement).dataset.catalogSize),
    initialOptionCount: Number((element as HTMLElement).dataset.initialOptionCount),
    animation: getComputedStyle(element).animationName,
  }));
}
test("cold and warm spotlight opening paint bounds stay short with the complete cached catalogue", async ({
  page,
  browser,
}) => {
  await ready(page);
  const cold = await opening(page);
  await page.keyboard.press("Escape");
  await expect(searchDialog(page)).toBeHidden();
  const warm = await opening(page);
  for (const timing of [cold, warm]) {
    expect(timing.paintUpperBoundMs).toBeGreaterThan(0);
    expect(timing.paintUpperBoundMs).toBeLessThan(250);
    expect(timing.catalogSize).toBeGreaterThan(80);
    expect(timing.initialOptionCount).toBeLessThanOrEqual(22);
    expect(timing.animation).toBe("none");
  }
  await searchDialog(page).getByRole("button", { name: "Calques", exact: true }).click();
  await expect(searchDialog(page).getByRole("option")).toHaveCount(24);
  await searchDialog(page).getByRole("combobox").fill("Keyboard rectangle 23");
  await page.getByRole("option", { name: /^Keyboard rectangle 23/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual(["keyboard-layer-23"]);
  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    dpr: devicePixelRatio,
    backend: document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset.backend,
    viewport: [innerWidth, innerHeight],
    reads: window.__musartVideoReadbacks,
  }));
  expect(environment.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/search-opening.json",
    JSON.stringify({ browser: browser.version(), cold, warm, environment }, null, 2),
  );
});
test("edited shortcuts persist across reload, display real keycaps and open the native image chooser", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("?");
  const editor = page.getByRole("dialog", { name: "Raccourcis clavier", exact: true });
  await expect(editor).toBeVisible();
  const filter = editor.getByRole("searchbox");
  await filter.fill("Enregistrer");
  const save = editor.locator('[data-binding-command="action:save"]'),
    recordSave = save.getByRole("button", {
      name: "Modifier le raccourci de Enregistrer",
      exact: true,
    });
  await recordSave.click();
  await page.keyboard.press("Control+z");
  await expect(save.getByRole("alert")).toContainText("Annuler");
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await recordSave.click();
  await page.keyboard.press("Control+Alt+p");
  await expect(recordSave).toContainText("P");
  await filter.fill("Rechercher dans MusArt");
  await editor
    .getByRole("button", { name: "Modifier le raccourci de Rechercher dans MusArt", exact: true })
    .click();
  await page.keyboard.press("Control+Alt+k");
  await filter.fill("Importer des images");
  await editor
    .getByRole("button", { name: "Modifier le raccourci de Importer des images", exact: true })
    .click();
  await page.keyboard.press("Control+Alt+i");
  await filter.fill("");
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/keyboard-shortcuts-editor.png" });
  await editor.getByRole("button", { name: "Fermer", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+Alt+i");
  await (await chooser).setFiles([]);
  await page.reload();
  await page.waitForFunction(() => !!window.musart);
  await page.keyboard.press("Control+Alt+k");
  await expect(searchDialog(page).getByRole("combobox")).toBeFocused();
  await searchDialog(page).getByRole("combobox").fill("import images");
  const item = searchDialog(page).getByRole("option", { name: /Importer des images/ });
  await expect(item.locator('[data-slot="kbd"]')).toHaveText(["Ctrl", "Alt", "I"]);
  await searchDialog(page).getByRole("combobox").fill("shortcuts");
  await searchDialog(page)
    .getByRole("option", { name: /Raccourcis clavier/ })
    .click();
  await editor.getByRole("button", { name: "Tout réinitialiser", exact: true }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("musart.keybindings.v1")!).overrides),
  ).toEqual({});
  await editor.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.keyboard.press("Control+k");
  await expect(searchDialog(page)).toBeVisible();
});

test("the first ten-thousand-layer spotlight opening stays bounded after lazy document preparation", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ready(page);
  const board = createPage({
    width: 1024,
    height: 1024,
    layers: Array.from({ length: 10000 }, (_, at) =>
      createLayer("rectangle", {
        id: `lazy-search-${at}`,
        name: `Search row ${at}`,
        x: (at % 100) * 10,
        y: Math.floor(at / 100) * 10,
        width: 8,
        height: 8,
      }),
    ),
  });
  await page.evaluate((project) => window.musart!.load(project), createProject({ pages: [board] }));
  await page.waitForFunction((id) => {
    const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
    return (
      data?.pageId === id &&
      data.rendererReady === "true" &&
      data.sceneRevision === data.renderedRevision
    );
  }, board.id);
  const cold = await opening(page);
  expect(cold.catalogSize).toBeGreaterThan(10000);
  expect(cold.paintUpperBoundMs).toBeLessThan(250);
  expect(cold.initialOptionCount).toBeLessThanOrEqual(22);
  await searchDialog(page).getByRole("combobox").fill("Search row 9999");
  await searchDialog(page)
    .getByRole("option", { name: /^Search row 9999/ })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual(["lazy-search-9999"]);
  await page.evaluate(() =>
    window.musart!.select(
      window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.id),
    ),
  );
  const warm = await opening(page);
  expect(warm.paintUpperBoundMs).toBeLessThan(250);
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/search-opening-10000.json", JSON.stringify({ cold, warm }, null, 2));
});
