import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, EFFECT_CATALOG } from "@musart/core";

for (const language of ["fr", "en"]) {
  test(`effect and color-adjustment menus follow the ${language} alphabet and add the chosen type`, async ({
    page,
  }) => {
    await page.addInitScript(
      (language) => localStorage.setItem("musart.language", language),
      language,
    );
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate(
      (project) => {
        window.musart!.load(project);
        window.musart!.select(["alphabet-owner"]);
      },
      createProject({
        pages: [
          createPage({
            width: 320,
            height: 240,
            layers: [createLayer("rectangle", { id: "alphabet-owner", width: 180, height: 120 })],
          }),
        ],
      }),
    );
    await expect(page.locator(".inspector")).toHaveAttribute(
      "data-selected-layer-id",
      "alphabet-owner",
    );
    for (const category of ["effect", "adjustment"] as const) {
      await page.locator(`[data-layer-add-category="${category}"]`).click();
      const menu = page.locator('.effect-catalog-menu[data-state="open"]');
      await expect(menu).toBeVisible();
      const labels = (await menu.getByRole("menuitem").allTextContents()).map((label) =>
        label.trim(),
      );
      expect(labels).toHaveLength(
        Object.values(EFFECT_CATALOG).filter((item) => item.category === category).length,
      );
      expect(labels).toEqual(
        [...labels].sort((a, b) =>
          a.localeCompare(b, language, { sensitivity: "base", numeric: true }),
        ),
      );
      const name =
        category === "effect"
          ? language === "fr"
            ? "Flou"
            : "Blur"
          : language === "fr"
            ? "Luminosité"
            : "Brightness";
      const choice = menu.getByRole("menuitem", { name, exact: true });
      await choice.scrollIntoViewIfNeeded();
      await choice.click();
      await expect(menu).toHaveCount(0);
      expect(
        await page.evaluate(
          () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.type,
        ),
      ).toBe(category === "effect" ? "blur" : "brightness");
      await page.evaluate(() => window.musart!.undo());
      expect(
        await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects),
      ).toEqual([]);
      expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    }
  });
}
