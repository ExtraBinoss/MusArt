import { expect, test, type Page } from "@playwright/test";

async function openPreferences(page: Page) {
  await page.locator(".brand-button").click();
  const dashboard = page.getByRole("dialog", { name: "Tableau de bord MusArt", exact: true });
  await dashboard.getByRole("button", { name: "Préférences", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Préférences", exact: true });
  await expect(preferences).toBeVisible();
  return preferences;
}
test("sidebar preferences persist editor settings and edit real shortcuts without document commands", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const before = await page.evaluate(() => window.musart!.snapshot());
  const preferences = await openPreferences(page);
  await expect(preferences.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
  await expect(preferences.getByRole("tab")).toHaveCount(4);
  await preferences.getByRole("tab", { name: "Apparence", exact: true }).click();
  await preferences.getByRole("radio", { name: "Sombre", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("musart.theme"))).toBe("dark");
  await preferences.getByRole("tab", { name: "Raccourcis", exact: true }).click();
  await preferences.getByRole("searchbox").fill("Enregistrer");
  const capture = preferences.getByRole("button", {
    name: "Modifier le raccourci de Enregistrer",
    exact: true,
  });
  await capture.click();
  await capture.press("Control+Alt+p");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("musart.keybindings.v1")!).overrides["action:save"],
    ),
  ).toEqual([{ key: "p", mod: true, alt: true, shift: false }]);
  await capture.click();
  await capture.press("Escape");
  await expect(preferences).toBeVisible();
  await preferences.getByRole("tab", { name: "Éditeur", exact: true }).click();
  const enabled = preferences.getByRole("switch", { name: "Accrocher aux éléments", exact: true }),
    threshold = preferences.getByRole("textbox", { name: "Distance d’accrochage", exact: true });
  await enabled.click();
  await expect(threshold).toBeDisabled();
  await enabled.click();
  await threshold.fill("9.5");
  await threshold.press("Enter");
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("musart.snapping.v1")!)),
  ).toMatchObject({ version: 1, enabled: true, threshold: 9.5 });
  await preferences.getByRole("button", { name: "Essayer le magnétisme", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Aperçu de l’accrochage", exact: true });
  await expect(preview.getByTestId("snapping-playground")).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/preferences-editor-sidebar.png" });
  await preview.getByRole("button", { name: "Fermer l’essai", exact: true }).click();
  await expect(preview).not.toBeVisible();
  await preferences.getByRole("button", { name: "Fermer", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Tableau de bord MusArt", exact: true })
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.project).toEqual(before.project);
  expect(after.canUndo).toBe(before.canUndo);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  const restored = await openPreferences(page);
  await restored.getByRole("tab", { name: "Éditeur", exact: true }).click();
  await expect(
    restored.getByRole("textbox", { name: "Distance d’accrochage", exact: true }),
  ).toHaveValue("9.5");
});
test("a short preferences window keeps sidebar navigation visible and scrolls the actual shortcut controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 420 });
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const preferences = await openPreferences(page),
    bounds = await preferences.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(420);
  await preferences.getByRole("tab", { name: "Raccourcis", exact: true }).click();
  const viewport = preferences.locator(".preferences-page-viewport");
  expect(await viewport.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await viewport.hover();
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(preferences.getByRole("tab", { name: "Général", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/preferences-shortcuts-short-window.png" });
  await page.setViewportSize({ width: 460, height: 600 });
  await expect(preferences.getByRole("tab", { name: "Général", exact: true })).toBeVisible();
  expect(
    await viewport.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts/screenshots/preferences-shortcuts-narrow-window.png" });
});
