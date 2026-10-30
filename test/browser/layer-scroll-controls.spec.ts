import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";
import { writeFile } from "node:fs/promises";

async function counters(page: Page) {
  return page.evaluate(() => {
    const selectors = {
      panel: ".layers-panel",
      menu: ".layers-panel .layer-selection-actions button",
      compositing: ".layer-compositing",
      actions: ".layers-panel .layers-header-actions",
    };
    return Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => [
        name,
        Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
      ]),
    );
  });
}

test("native reverse scrolling preserves focus on a retained row while recycling other shells", async ({
  page,
}) => {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const board = createPage({
    layers: Array.from({ length: 100 }, (_, at) =>
      createLayer("rectangle", { id: `focus-${at}`, name: `Focus ${at}` }),
    ),
  });
  await page.evaluate((project) => window.musart!.load(project), createProject({ pages: [board] }));
  const tree = page.locator(".layer-tree");
  await tree.hover();
  await page.mouse.wheel(0, 360);
  await page.waitForFunction(() => document.querySelector(".layer-tree")!.scrollTop >= 359);
  const target = tree.locator('[data-layer-id="focus-89"] .layer-actions button').last();
  await target.focus();
  await target.evaluate((node) => node.setAttribute("data-focus-probe", "retained"));
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(
    () => Math.abs(document.querySelector(".layer-tree")!.scrollTop - 180) < 1,
  );
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute("data-focus-probe", "retained");
  expect(await tree.evaluate((node) => node.scrollTop)).toBeCloseTo(180, 0);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
});

test("reversing native scroll reuses the same decoded thumbnail inside the retained row window", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const board = createPage({
    layers: Array.from({ length: 30 }, (_, index) =>
      createLayer("rectangle", { name: `Retained ${index}`, fill: "#3366ff" }),
    ),
  });
  await page.evaluate((project) => window.musart!.load(project), createProject({ pages: [board] }));
  const tree = page.locator(".layer-tree"),
    thumbnail = tree.locator("[data-thumbnail-layer-id]").first();
  await expect(thumbnail.locator("img")).toBeVisible();
  await thumbnail.locator("img").evaluate((image) => (image as HTMLImageElement).decode());
  const before = await thumbnail.evaluate((node) => {
    const image = node.querySelector("img")!;
    if (!image.complete || !image.naturalWidth) throw new Error("Thumbnail has not decoded.");
    image.dataset.retainedProbe = "original";
    return { source: image.src, requests: node.getAttribute("data-preview-requests") };
  });
  const stats = await counters(page);
  await tree.hover();
  await page.mouse.wheel(0, 144);
  await page.waitForFunction(() => document.querySelector(".layer-tree")!.scrollTop >= 143);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await thumbnail.locator("img").getAttribute("data-retained-probe")).toBe("original");
  await page.mouse.wheel(0, -144);
  await page.waitForFunction(() => document.querySelector(".layer-tree")!.scrollTop < 1);
  await expect(thumbnail.locator("img")).toBeVisible();
  expect(
    await thumbnail.evaluate((node) => ({
      source: node.querySelector("img")!.src,
      requests: node.getAttribute("data-preview-requests"),
    })),
  ).toEqual(before);
  expect(await thumbnail.locator("img").getAttribute("data-retained-probe")).toBe("original");
  expect(await counters(page)).toEqual(stats);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

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
    expect(after.panel).toBe(before.panel);
    for (const name of ["menu", "compositing", "actions"])
      expect(after[name], `${name} rendered during virtual scrolling`).toBe(before[name]);
    expect(await tree.locator("[data-layer-id]").count()).toBeLessThan(40);
    return { before, after };
  };
  const unselected = await scroll();
  await expect(controls.locator("input")).toBeDisabled();
  await page.evaluate((id) => window.musart!.select([id]), owner.id);
  await expect(controls.locator("input")).toBeEnabled();
  const add = page.locator(
    '.layers-panel .layer-create-actions [data-slot="dropdown-menu-trigger"]',
  );
  await expect(add).toBeEnabled();
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
  await expect(add).toBeDisabled();
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
