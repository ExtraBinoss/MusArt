import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { inspectImage } from "./support/image-probe";

for (const fallback of [false, true]) {
  test(`first-visit onboarding uses real gradients and remembers completion (${fallback ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    if (fallback)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await installReadbackProbe(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Bienvenue dans MusArt" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    const art = page.locator(".onboarding-gradient");
    await expect(art).toHaveAttribute("data-gradient-state", "ready");
    const backend = await art.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      if (canvas.getContext("webgpu")) return "webgpu";
      return canvas.getContext("webgl2") ? "webgl2" : "unavailable";
    });
    expect(backend).toBe(fallback ? "webgl2" : "webgpu");
    await expect(page.locator(".canvas-artboard canvas")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("musart.onboarding.v1"))).toBeNull();
    const movingBefore = await art.screenshot();
    const beforeFrames = Number(await art.getAttribute("data-gradient-frames"));
    await expect
      .poll(async () => Number(await art.getAttribute("data-gradient-frames")))
      .toBeGreaterThan(beforeFrames + 3);
    const movingAfter = await art.screenshot();
    await page.getByRole("button", { name: "Mettre le dégradé en pause" }).click();
    const movingA = await inspectImage(page, movingBefore, [{ x: 0, y: 0, width: 1, height: 1 }]);
    const movingB = await inspectImage(page, movingAfter, [{ x: 0, y: 0, width: 1, height: 1 }]);
    expect(movingA.regions[0]!.hash).not.toBe(movingB.regions[0]!.hash);
    const first = await art.screenshot();
    const image = await inspectImage(page, first, [{ x: 0, y: 0, width: 1, height: 1 }]);
    expect(image.colors).toBeGreaterThan(50);
    await page.getByRole("button", { name: "Palette Aurora" }).click();
    await expect(art).toHaveAttribute("data-gradient-palette", "aurora");
    const second = await inspectImage(page, await art.screenshot(), [
      { x: 0, y: 0, width: 1, height: 1 },
    ]);
    expect(second.regions[0]!.hash).not.toBe(image.regions[0]!.hash);
    await mkdir("artifacts/screenshots", { recursive: true });
    await page.screenshot({
      path: `artifacts/screenshots/onboarding-${fallback ? "webgl" : "webgpu"}.png`,
    });
    await page.getByRole("button", { name: "Faire un petit tour" }).click();
    await expect(page.getByRole("heading", { name: /Jouez avec les calques/ })).toBeFocused();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(page.getByText(/Effacer les données/)).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir mon atelier" }).click();
    await expect(page.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
    await expect(art).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    const projects = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const opening = indexedDB.open("musart-studio");
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const count = db.transaction("projects").objectStore("projects").count();
            count.onsuccess = () => {
              db.close();
              resolve(count.result);
            };
            count.onerror = () => {
              db.close();
              reject(count.error);
            };
          };
        }),
    );
    expect(projects).toBe(0);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("musart.onboarding.v1")!)),
    ).toEqual({ version: 1, completed: true });
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
    await expect(page.locator(".onboarding-dialog")).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const p = window.__musartVideoReadbacks!;
        return [p.gpu, p.webgl, p.canvas];
      }),
    ).toEqual([0, 0, 0]);
    expect(errors).toEqual([]);
  });
}

test("small screens, dark mode, reduced motion and English remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/");
  const art = page.locator(".onboarding-gradient");
  await expect(page.getByRole("dialog", { name: "Bienvenue dans MusArt" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(art).toHaveAttribute("data-gradient-state", "ready");
  const frames = await art.getAttribute("data-gradient-frames");
  await page.waitForTimeout(180);
  await expect(art).toHaveAttribute("data-gradient-frames", frames!);
  await expect(page.getByRole("button", { name: "Mettre le dégradé en pause" })).toBeHidden();
  await page.getByRole("button", { name: "Passer en anglais" }).click();
  await expect(page.getByRole("dialog", { name: "Welcome to MusArt" })).toBeVisible();
  const scroll = page.locator(".onboarding-scroll");
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole("button", { name: "Show me around" }).click();
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const start = page.getByRole("button", { name: "Open my studio" });
  await expect(start).toBeInViewport();
  const overflow = await page
    .locator(".onboarding-dialog")
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/onboarding-mobile-dark.png" });
  await start.click();
  await expect(page.getByRole("dialog", { name: "MusArt dashboard" })).toBeVisible();
});
