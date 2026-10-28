import { expect, test, type Locator, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "light");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
}

async function expectConnected(group: Locator, count: number) {
  const buttons = group.locator(":scope > button");
  await expect(buttons).toHaveCount(count);
  const boxes = await buttons.evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right, height } = element.getBoundingClientRect();
      return { left, right, height };
    }),
  );
  for (let index = 1; index < boxes.length; index++) {
    expect(Math.abs(boxes[index]!.left - boxes[index - 1]!.right)).toBeLessThanOrEqual(1);
    expect(boxes[index]!.height).toBe(boxes[0]!.height);
  }
}

test("floating shortcuts keep readable contrast in both themes and controls form connected groups", async ({
  page,
}) => {
  await ready(page);
  for (const [mode, theme] of [
    ["Clair", "light"],
    ["Sombre", "dark"],
  ]) {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("settings");
    await page.getByRole("option", { name: /^Préférences/ }).click();
    const themes = page.getByRole("group", { name: "Thème", exact: true });
    await themes.getByRole("button", { name: mode, exact: true }).click();
    await expect(themes.getByRole("button", { pressed: true })).toHaveCount(1);
    await expectConnected(themes, 3);
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.getByRole("button", { name: "Sélection", exact: true }).hover();
    const key = page.locator('[data-slot="tooltip-content"]:visible [data-slot="kbd"]');
    await expect(key).toHaveText("V");
    const contrast = await key.evaluate((element) => {
      const style = getComputedStyle(element);
      function luminance(color: string) {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
        const linear = channels.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
      }
      const foreground = luminance(style.color),
        background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `artifacts/screenshots/keyboard-tooltip-${theme}.png` });
  }
  await page.getByRole("button", { name: "Ouvrir la bibliothèque de formes", exact: true }).click();
  const categories = page.getByRole("group", { name: "Bibliothèque", exact: true });
  await expectConnected(categories, 4);
  const search = page.getByRole("searchbox", { name: "Rechercher", exact: true });
  await search.fill("cœur");
  await expect(page.getByRole("button", { name: "Utiliser Cœur", exact: true })).toBeVisible();
  await categories.getByRole("button", { name: "Icônes", exact: true }).click();
  await expect(categories.getByRole("button", { name: "Icônes", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(categories.getByRole("button", { pressed: true })).toHaveCount(1);
  await expect(search).toHaveValue("");
  await page.screenshot({ path: "artifacts/screenshots/shape-button-group.png" });
});
