import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, EFFECT_CATALOG } from "@musart/core";

for (const language of ["fr", "en"]) {
  test(`effect and color-adjustment menus group and filter the ${language} catalog and add the chosen type`, async ({
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
      await page.locator(".layers-header-actions .layer-create-actions button").click();
      const categoryName =
        category === "effect"
          ? language === "fr"
            ? "Ajouter un effet"
            : "Add effect"
          : language === "fr"
            ? "Ajouter un réglage"
            : "Add adjustment";
      await page.getByRole("menuitem", { name: categoryName, exact: true }).hover();
      const menu = page.locator('.effect-catalog-menu[data-state="open"]');
      await expect(menu).toBeVisible();
      const labels = (await menu.getByRole("menuitem").allTextContents()).map((label) =>
        label.trim(),
      );
      expect(labels).toHaveLength(
        Object.values(EFFECT_CATALOG).filter((item) => item.category === category && !item.source)
          .length,
      );
      for (const group of await menu.getByRole("group").all()) {
        const grouped = (await group.getByRole("menuitem").allTextContents()).map((label) =>
          label.trim(),
        );
        expect(grouped).toEqual(
          [...grouped].sort((a, b) =>
            a.localeCompare(b, language, { sensitivity: "base", numeric: true }),
          ),
        );
      }
      const name =
        category === "effect"
          ? language === "fr"
            ? "Flou"
            : "Blur"
          : language === "fr"
            ? "Luminosité"
            : "Brightness";
      const choice = menu.getByRole("menuitem", { name, exact: true });
      const search = menu.getByRole("textbox");
      await search.fill(name);
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.locator(".scroll-shadow > .effect-catalog-viewport")).toBeVisible();
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
