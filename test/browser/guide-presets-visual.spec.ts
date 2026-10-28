import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";

for (const height of [900, 600]) {
  test(`guide preset cards keep fixed tracks, real format ratios and shared tabs at ${height}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height });
    await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({
        pages: [createPage({ width: 1080, height: 1350 })],
      }),
    );
    await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Modèles", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Modèles de repères", exact: true });
    await expect(picker.getByRole("tablist")).toHaveClass(/segmented-tabs/);
    await expect
      .poll(() =>
        picker.evaluate((element) =>
          element.getAnimations().every((animation) => animation.playState !== "running"),
        ),
      )
      .toBe(true);
    await expect(picker).toBeInViewport({ ratio: 1 });
    const bounds = await picker.boundingBox();
    if (!bounds) throw Error("Missing guide preset popover");
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    for (const [category, count] of [
      ["Tous", 8],
      ["Réseaux", 5],
      ["Vidéo", 3],
      ["Tous", 8],
    ] as const) {
      await picker.getByRole("tab", { name: category, exact: true }).click();
      await expect(picker.getByRole("tab", { name: category, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(picker.locator(".guide-preset")).toHaveCount(count);
      const actual = await picker.boundingBox();
      expect(actual!.height).toBeCloseTo(bounds.height, 0);
      const measurements = await picker.locator(".guide-preset").evaluateAll((cards) =>
        cards.map((card) => {
          const format = card.querySelector<HTMLElement>(".guide-preset-format")!,
            rect = format.getBoundingClientRect(),
            icon = card.querySelector(".guide-preset-name svg")!.getBoundingClientRect();
          return {
            height: card.getBoundingClientRect().height,
            ratio: rect.width / rect.height,
            expected: Number(format.dataset.formatWidth) / Number(format.dataset.formatHeight),
            iconWidth: icon.width,
            iconHeight: icon.height,
            gradient: getComputedStyle(format).backgroundImage,
          };
        }),
      );
      for (const item of measurements) {
        expect(item.height).toBeCloseTo(158, 0);
        expect(item.ratio).toBeCloseTo(item.expected, 2);
        expect(item.iconWidth).toBeCloseTo(13, 0);
        expect(item.iconHeight).toBeCloseTo(13, 0);
        expect(item.gradient).toContain("gradient");
      }
      expect(new Set(measurements.map((item) => item.gradient)).size).toBeGreaterThan(1);
    }
    await page.screenshot({ path: `artifacts/screenshots/guides-presets-refined-${height}.png` });
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
  });
}
