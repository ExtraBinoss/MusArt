import { expect, type Page } from "@playwright/test";
import { MAX_WHEEL_ZOOM_PIXELS, WHEEL_ZOOM_GAIN } from "../../../apps/web/src/canvas/viewport/view";
/** Fit remains a real command-search action without occupying the floating controls. */
export async function fitViewport(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Rechercher dans MusArt", exact: true })
    .fill("ajuster écran");
  await page.getByRole("option", { name: /Ajuster à l’écran/ }).click();
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
}
/** Real wheel events, bounded like a physical trackpad gesture; waits for its exact settled pose. */
export async function zoomViewport(page: Page, target: number) {
  const artboard = page.getByTestId("artboard");
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  const zoom = Number(await artboard.getAttribute("data-zoom"));
  let remaining = -Math.log(target / zoom) / WHEEL_ZOOM_GAIN;
  const dpr = await page.evaluate(() => devicePixelRatio);
  await page.keyboard.down("Control");
  try {
    while (Math.abs(remaining) > 1e-7) {
      const delta = Math.sign(remaining) * Math.min(Math.abs(remaining), MAX_WHEEL_ZOOM_PIXELS);
      // Chromium CDP normalizes driver deltas by deviceScaleFactor. Scale only
      // synthetic driver input so app handlers receive the requested CSS delta.
      await page.mouse.wheel(0, delta * dpr);
      remaining -= delta;
    }
  } finally {
    await page.keyboard.up("Control");
  }
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  await expect
    .poll(async () => Number(await artboard.getAttribute("data-zoom")))
    .toBeCloseTo(target, 5);
}
