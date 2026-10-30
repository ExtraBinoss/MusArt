import { expect, type Page } from "@playwright/test";
import { output, prepare, reorderFixture, point, frames, counters } from "./motion-canvas";

/** Real pointer input must leave DOM labels and painted canvas rows stationary. */
export async function verifyCanvasStationaryPose(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await prepare(page, reorderFixture());
  const label = (id: string) =>
    `.motion-row[data-labels-only=true]:not(.is-property)[data-layer-id="${id}"]`;
  const geometry = () =>
    page.locator(".motion-row[data-labels-only=true]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        key: (node as HTMLElement).dataset.motionRowKey,
        top: node.getBoundingClientRect().top,
        transform: getComputedStyle(node).transform,
        animations: node.getAnimations().length,
      })),
    );
  const source = await point(page, label("peer"), 3);
  const target = await point(page, label("card"), 3, -1);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await frames(page);
  const before = await geometry();
  const original = await page.evaluate(() => window.musart!.snapshot());
  const quiet = await counters(page);
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await expect(page.locator(label("peer"))).toHaveAttribute("data-layer-reorder-source", "true");
  await expect(page.locator(".layer-drop-cue:visible")).toHaveCount(1);
  expect(await geometry()).toEqual(before);
  expect(await counters(page)).toEqual(quiet);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original.project);
  await page.screenshot({ path: `${output}/stationary-pose-held.png` });
  const property = await point(page, '[data-labels-only=true][data-motion-row-key="card-x"]', 3);
  await page.mouse.move(property.x, property.y, { steps: 4 });
  await expect(page.locator('.layer-drop-cue[data-drop-rejected="property"]:visible')).toHaveCount(
    1,
  );
  await expect(page.locator(".layer-drop-cue:visible")).toHaveCount(1);
  expect(errors.some((message) => message.includes("property"))).toBe(true);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".layer-drop-cue:visible")).toHaveCount(0);
  await expect(page.locator("[data-timeline-drop-target]:not([hidden])")).toHaveCount(0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(original.revision);
}
