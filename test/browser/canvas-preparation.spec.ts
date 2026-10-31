import { expect, test } from "@playwright/test";

test("canvas preparation keeps the real mascot stable until a matching native frame and fades without a blur wipe", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("./editor?template=morphing-type&automation=1");
  const loading = page.locator(".canvas-loading .ui-throbber");
  await expect(loading).toHaveAttribute("data-visible", "true");
  await expect(loading).toContainText("Preparing canvas");
  await expect(loading.locator("svg")).toHaveAttribute("viewBox", "-158 -158 316 316");
  await page.screenshot({ path: "artifacts/canvas-preparation.png" });
  const canvas = page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-presentation-ready", "true");
  await expect(page.locator(".canvas-loading")).toBeHidden();
  expect(
    await canvas.evaluate((el) => ({
      filter: getComputedStyle(el).filter,
      clip: getComputedStyle(el).clipPath,
    })),
  ).toEqual({ filter: "none", clip: "none" });
  expect(
    await page.evaluate(() => {
      const page = window.musart!.snapshot().project.pages[0]!;
      return [page.width, page.height];
    }),
  ).toEqual([1920, 1080]);
  expect(errors).toEqual([]);
});
