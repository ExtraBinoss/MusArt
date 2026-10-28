import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
test("collapsed attachment cards select real FX/masks and Delete, footer and CmdK preserve their owner", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const effect = createEffect("dither", { id: "selected-dither" }),
    owner = createLayer("rectangle", {
      id: "attachment-owner",
      name: "Attachment owner",
      effects: [createEffect("contrast"), createEffect("grain"), effect],
      mask: { layerId: "mask-source", enabled: true, inverted: false },
    }),
    project = createProject({
      pages: [
        createPage({
          layers: [owner, createLayer("ellipse", { id: "mask-source", maskSource: true })],
        }),
      ],
    });
  const reload = async () => {
    await page.evaluate((project) => window.musart!.load(project), project);
  };
  const state = () => page.evaluate(() => window.musart!.snapshot());
  await reload();
  const row = page.locator('[data-layer-id="attachment-owner"]'),
    card = row.locator('[data-attachment-effect-id="selected-dither"]');
  await expect(row.locator(".attachment-thumbnail-card")).toHaveCount(3);
  await expect(row.locator('[data-attachment-target="mask"]')).toBeVisible();
  await expect(page.locator('[role="treeitem"][data-effect-id]')).toHaveCount(0);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await state()).project.pages[0]!.layers[0]!.effects.length)
    .toBe(2);
  expect((await state()).project.pages[0]!.layers).toHaveLength(2);
  await page.evaluate(() => window.musart!.undo());
  expect((await state()).canUndo).toBe(false);
  await card.click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "Actions des calques", exact: true })
    .getByRole("button", { name: "Retirer l’effet", exact: true })
    .click();
  expect((await state()).project.pages[0]!.layers).toHaveLength(2);
  await page.evaluate(() => window.musart!.undo());
  const maskCard = row.locator('[data-attachment-target="mask"]');
  await maskCard.click();
  await page.keyboard.press("Escape");
  await expect(maskCard).toBeFocused();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Rechercher dans MusArt", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Supprimer");
  await page
    .getByRole("dialog", { name: "Rechercher dans MusArt", exact: true })
    .locator('[cmdk-item][data-value="action:delete"]')
    .click();
  await expect.poll(async () => (await state()).project.pages[0]!.layers[0]!.mask).toBeNull();
  expect((await state()).project.pages[0]!.layers).toHaveLength(2);
  await page.evaluate(() => window.musart!.undo());
  await expect(row.locator(".attachment-thumbnail-card")).toHaveCount(3);
  await page.screenshot({ path: "artifacts/screenshots/attachment-cards-selection.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});
