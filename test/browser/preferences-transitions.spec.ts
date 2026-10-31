import { expect, test } from "@playwright/test";

test("preferences reveal active tabs, keep Try beside snapping distance and fade the actual glass surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 500 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "light");
  });
  await page.goto("./dashboard");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.preferencesReveals = "0";
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "preferences-page-reveal")
        document.documentElement.dataset.preferencesReveals = String(
          Number(document.documentElement.dataset.preferencesReveals) + 1,
        );
    });
  });
  const editor = dialog.getByRole("tab", { name: "Editor", exact: true });
  await editor.click();
  const heading = dialog.locator(".preferences-setting-heading");
  const label = await heading.locator("strong").boundingBox();
  const action = heading.getByRole("button", { name: "Try snapping", exact: true });
  await expect(action).toHaveText("Try");
  const button = await action.boundingBox();
  expect(button!.x).toBeGreaterThan(label!.x + label!.width);
  expect(Math.abs(button!.y + button!.height / 2 - label!.y - label!.height / 2)).toBeLessThan(2);
  await action.click();
  const preview = page.getByTestId("snapping-preview-popover");
  const object = preview.getByRole("button", { name: "Movable preview object" });
  await object.focus();
  await object.press("ArrowRight");
  await expect(preview.getByTestId("snapping-playground")).toHaveAttribute("data-x", "53");
  await preview.getByRole("button", { name: "Close preview", exact: true }).click();
  await dialog.getByRole("tab", { name: "Shortcuts", exact: true }).click();
  const viewport = dialog.locator(".preferences-page-viewport");
  await viewport.hover();
  await page.mouse.wheel(0, 200);
  const shadow = dialog.locator(".preferences-page-scroll");
  await expect(shadow).toHaveAttribute("data-overflow-top", "");
  await expect(shadow).toHaveAttribute("data-scroll-shadow-fade", "mask");
  expect(await shadow.evaluate((el) => getComputedStyle(el, "::before").display)).toBe("none");
  expect(await viewport.evaluate((el) => getComputedStyle(el).maskImage)).toContain(
    "linear-gradient",
  );
  await expect
    .poll(() => page.evaluate(() => Number(document.documentElement.dataset.preferencesReveals)))
    .toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: "artifacts/preferences-glass-light.png" });
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await dialog.getByRole("radio", { name: "Dark", exact: true }).click();
  await dialog.getByRole("tab", { name: "Shortcuts", exact: true }).click();
  await viewport.hover();
  await page.mouse.wheel(0, 200);
  await expect(shadow).toHaveAttribute("data-overflow-top", "");
  await page.screenshot({ path: "artifacts/preferences-glass-dark.png" });
  await page.setViewportSize({ width: 460, height: 600 });
  await editor.click();
  const narrowLabel = await heading.locator("strong").boundingBox();
  const narrowAction = await action.boundingBox();
  expect(narrowAction!.x).toBeGreaterThan(narrowLabel!.x + narrowLabel!.width);
  expect(await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await dialog
      .locator(".preferences-page-body")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
