import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("Motion keeps floating controls clear of the header and rulers, with hover scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.execute({ type: "setCompositionMode", mode: "motion" });
    },
    createProject({
      pages: [
        createPage({
          width: 500,
          height: 400,
          rulers: true,
          layers: [createLayer("rectangle", { width: 160, height: 120 })],
        }),
      ],
    }),
  );
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.locator(".motion-timeline-dock")).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const header = document.querySelector(".project-trigger")!.getBoundingClientRect();
        const toolbar = document.querySelector(".workspace > .toolbar")!.getBoundingClientRect();
        const workspace = document.querySelector(".workspace")!.getBoundingClientRect();
        const ruler = document.querySelector(".ruler-y")!.getBoundingClientRect();
        return (
          toolbar.top >= header.bottom + 10 &&
          toolbar.bottom <= workspace.bottom - 10 &&
          toolbar.left >= ruler.right + 10 &&
          header.left >= ruler.right + 10
        );
      });
    })
    .toBe(true);
  const viewport = page.locator(".toolbar-contents");
  const down = page.getByRole("button", { name: "Faire défiler les outils vers le bas" });
  await expect(down).toBeEnabled();
  await down.hover();
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await page.mouse.move(700, 100);
  const stopped = await viewport.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(100);
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(stopped);
  const heights = await page
    .locator(".brand-button, .project-pill, .canvas-controls, .canvas-timeline-toggle")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(new Set(heights)).toEqual(new Set([42]));
  const zoom = page.getByRole("button", { name: "Zoomer", exact: true });
  await zoom.hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveAttribute(
    "data-side",
    "bottom",
  );
  await page.screenshot({ path: "artifacts/screenshots/responsive-motion-toolbar.png" });
  await page.evaluate(() =>
    window.musart!.execute({ type: "updatePage", patch: { rulers: false } }),
  );
  await expect(page.locator(".canvas-rulers")).toBeHidden();
  await expect
    .poll(() =>
      page.locator(".toolbar").evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBe(12);
});
