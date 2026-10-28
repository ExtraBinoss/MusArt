import { expect, test, type Page } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";

async function command(page: Page, query: string, name: string) {
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Rechercher dans MusArt", exact: true }).fill(query);
  await page.getByRole("option", { name, exact: true }).click();
}
test("command search and the real snapping sandbox share persisted preferences without project edits", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(
    page.locator('[data-testid="artboard"] canvas[data-renderer-ready="true"]'),
  ).toBeVisible();
  const before = await page.evaluate(() => window.musart!.snapshot());
  await command(page, "désactiver magnétisme", "Désactiver le magnétisme des éléments");
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("musart.snapping.v1")!).enabled),
  ).toBe(false);
  await command(page, "distance magnétisme", "Réglages de l’éditeur et distance de magnétisme");
  const preferences = page.getByRole("dialog", { name: "Préférences", exact: true });
  await expect(preferences.getByRole("tab", { name: "Éditeur", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    preferences.getByRole("switch", { name: "Accrocher aux éléments" }),
  ).not.toBeChecked();
  await preferences.getByRole("switch", { name: "Accrocher aux éléments" }).click();
  const beforeBounds = (await preferences.boundingBox())!;
  await preferences.getByRole("button", { name: "Essayer le magnétisme" }).click();
  const preview = page.getByTestId("snapping-preview-popover");
  await expect(preview).toBeVisible();
  expect((await preferences.boundingBox())!.height).toBeCloseTo(beforeBounds.height, 3);
  const stage = page.getByTestId("snapping-playground"),
    moving = preview.getByRole("button", { name: "Objet à déplacer" });
  const start = (await moving.boundingBox())!,
    box = (await stage.locator("svg").boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + ((230 + 26) * box.width) / 360,
    box.y + ((82 + 24) * box.height) / 180,
    { steps: 8 },
  );
  await expect(stage).toHaveAttribute("data-x", "232");
  await expect(stage).toHaveAttribute("data-snapped", "true");
  await page.mouse.up();
  await page.screenshot({ path: "artifacts/screenshots/preferences-snapping-try.png" });
  await preview.getByRole("button", { name: "Fermer l’essai", exact: true }).click();
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.project).toEqual(before.project);
  expect(after.canUndo).toBe(before.canUndo);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await preferences.getByRole("button", { name: "Fermer", exact: true }).click();
  await command(page, "activer magnétisme", "Activer le magnétisme des éléments");
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("musart.snapping.v1")!).enabled),
  ).toBe(true);
});
