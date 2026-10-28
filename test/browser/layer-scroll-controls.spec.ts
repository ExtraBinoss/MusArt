import { expect, test, type Page } from "@playwright/test";
import { createEffect, createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";
import { writeFile } from "node:fs/promises";

async function counters(page: Page) {
  return page.evaluate(() => {
    const selectors = {
      panel: ".layers-panel",
      menu: ".layers-panel .heading-actions button",
      compositing: ".layer-compositing",
      effects: '[data-layer-add-category="effect"]',
      adjustments: '[data-layer-add-category="adjustment"]',
    };
    return Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => [
        name,
        Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
      ]),
    );
  });
}

test("native virtual scrolling skips stable header controls while selection, attachment and page edits remain live", async ({
  page,
}) => {
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const first = createTechnoArtboard(),
    second = createTechnoArtboard(),
    owner = first.layers.at(-1)!,
    effect = createEffect("brightness");
  owner.effects = [effect];
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [first, second] }),
  );
  await expect(page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]')).toBeVisible();
  const tree = page.locator(".layer-tree"),
    controls = page.locator(".layer-compositing");
  const scroll = async () => {
    await tree.hover();
    const before = await counters(page);
    for (let index = 0; index < 24; index++) await page.mouse.wheel(0, 420);
    const after = await counters(page);
    expect(after.panel).toBeGreaterThan(before.panel);
    for (const name of ["menu", "compositing", "effects", "adjustments"])
      expect(after[name], `${name} rendered during virtual scrolling`).toBe(before[name]);
    expect(await tree.locator("[data-layer-id]").count()).toBeLessThan(40);
    return { before, after };
  };
  const unselected = await scroll();
  await expect(controls.locator("input")).toBeDisabled();
  await page.evaluate((id) => window.musart!.select([id]), owner.id);
  await expect(controls.locator("input")).toBeEnabled();
  await expect(page.locator('[data-layer-add-category="effect"]')).toBeEnabled();
  const card = page.locator(`[data-attachment-effect-id="${effect.id}"]`).first();
  await expect(card).toBeVisible();
  await card.click();
  const popover = page.locator(".layer-attachment-popover");
  await expect(popover).toBeVisible();
  await expect(controls.locator("input")).toBeDisabled();
  // Toggle the same trigger closed while retaining the selected attachment.
  await card.click();
  await expect(popover).not.toBeVisible();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  const attached = await scroll();
  await expect(controls.locator("input")).toBeDisabled();
  await page.evaluate(
    (id) => window.musart!.execute({ type: "updateLayers", ids: [id], patch: { locked: true } }),
    owner.id,
  );
  await expect(page.locator('[data-layer-add-category="effect"]')).toBeDisabled();
  await expect(page.locator('[data-layer-add-category="adjustment"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/screenshots/layer-scroll-stable-controls.png" });
  await writeFile(
    "artifacts/layer-scroll-stable-controls.json",
    JSON.stringify({ unselected, attached, errors }, null, 2),
  );
});
