import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function storedProjectIds(page: Page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open("musart-studio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = db.transaction("projects").objectStore("projects").getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

for (const fallback of [false, true]) {
  test(`first visit creates no placeholder and opens a real portable template (${fallback ? "WebGL" : "WebGPU"})`, async ({
    page,
  }, info) => {
    if (fallback)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await installReadbackProbe(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const landing = page.locator(".landing-page");
    await expect(page.getByRole("heading", { level: 1, name: "Créez. Animez." })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("video")).toHaveCount(0);
    expect(await storedProjectIds(page)).toEqual([]);
    await page.keyboard.press("Control+s");
    await page.keyboard.press("Escape");
    await expect(landing).toBeVisible();
    expect(await storedProjectIds(page)).toEqual([]);
    await page.getByRole("button", { name: "Try Melt", exact: true }).click();
    const dashboard = page.getByRole("dialog", { name: "Tableau de bord Melt", exact: true });
    await expect(dashboard).toBeVisible();
    expect(await storedProjectIds(page)).toEqual([]);
    await page.getByRole("button", { name: "Retour à l’accueil", exact: true }).click();
    await expect(landing).toBeVisible();
    await page.getByRole("button", { name: "Créer depuis Story Instagram", exact: true }).click();
    const canvas = page.locator('.canvas-artboard canvas[data-renderer-ready="true"]');
    await expect(canvas).toBeVisible();
    const backend = await canvas.evaluate((element: HTMLCanvasElement) =>
      element.getContext("webgpu")
        ? "webgpu"
        : element.getContext("webgl2")
          ? "webgl2"
          : "unavailable",
    );
    expect(backend).toBe(fallback ? "webgl2" : "webgpu");
    const ids = await storedProjectIds(page);
    expect(ids).toHaveLength(1);
    await page.getByRole("button", { name: "Actions du projet", exact: true }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger le projet .musart", exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.musart$/);
    const project = parseProject(await readFile((await download.path())!, "utf8"));
    expect(project.id).toBe(ids[0]);
    expect(project.pages[0]).toMatchObject({ width: 1080, height: 1920, layers: [] });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(canvas).toBeVisible();
    await expect(landing).toHaveCount(0);
    expect(await storedProjectIds(page)).toEqual(ids);
    await page.screenshot({
      path: info.outputPath(`first-visit-${fallback ? "webgl" : "webgpu"}.png`),
    });
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
  });
}

test("small screens, system dark mode, reduced motion and English stay usable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.theme", "system");
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Create. Animate." })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".hero-letter").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".hero-letter").first()).toHaveCSS("transform", "none");
  await page
    .getByRole("heading", { name: "Your agent, by your side.", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page
      .locator(".landing-page")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(false);
  await page.screenshot({ path: info.outputPath("first-visit-mobile-dark.png") });
  await page.getByRole("button", { name: "Try Melt", exact: true }).click();
  const dashboard = page.getByRole("dialog", { name: "Melt dashboard", exact: true });
  await expect(dashboard).toBeVisible();
  await expect(dashboard.getByRole("tab", { name: "Projects", exact: true })).toBeInViewport();
  await expect(
    dashboard.getByRole("button", { name: "New project", exact: true }),
  ).toBeInViewport();
  expect(await storedProjectIds(page)).toEqual([]);
});

test("a real template download failure leaves the landing usable without saving a project", async ({
  page,
}) => {
  await page.route("**/templates/motion/in-bloom.json", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  const template = page.getByRole("button", {
    name: "Créer depuis In Bloom — Démo Motion",
    exact: true,
  });
  await template.click();
  await expect(page.getByRole("alert")).toContainText(
    "Le modèle n’a pas pu être téléchargé. Réessayez.",
  );
  await expect(template).toBeEnabled();
  await expect(page.locator(".landing-page")).toBeVisible();
  expect(await storedProjectIds(page)).toEqual([]);
  await page.getByRole("button", { name: "Try Melt", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Tableau de bord Melt", exact: true }),
  ).toBeVisible();
  expect(await storedProjectIds(page)).toEqual([]);
});
