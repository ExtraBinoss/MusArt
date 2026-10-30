import { expect, type Page } from "@playwright/test";

/** Use the always-available library action on desktop and touch layouts. */
export async function openProjectLibrary(page: Page) {
  await page.getByRole("button", { name: "Actions du projet", exact: true }).click();
  await page.getByRole("button", { name: "Projets", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Tableau de bord Melt" })).toBeVisible();
}
