import { expect, test } from "@playwright/test";

test("motion previews expose native pause/resume and details put the name first with aligned actions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("./dashboard");
  const card = page.locator(".template-card-entry").filter({ hasText: "Share Your Work" }).first();
  await expect(card).toBeVisible();
  const preview = card.locator(".motion-template-preview");
  await expect(preview.locator(".motion-preview-hint")).toHaveText("Hover to preview");
  await preview.hover();
  await expect(preview).toHaveAttribute("data-preview-status", "playing");
  const pause = card.getByRole("button", { name: "Pause preview", exact: true });
  await pause.click();
  await expect(preview).toHaveAttribute("data-preview-status", "paused");
  const time = await preview
    .locator(".motion-template-preview-canvas")
    .getAttribute("data-preview-time");
  await page.waitForTimeout(180);
  expect(
    await preview.locator(".motion-template-preview-canvas").getAttribute("data-preview-time"),
  ).toBe(time);
  await card.getByRole("button", { name: "Play preview", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveAttribute("data-preview-status", "playing");
  await page.mouse.move(10, 10);
  await expect(preview).toHaveAttribute("data-preview-status", "idle");
  await card.locator(".template-card").click();
  const details = page.locator(".library-item-dialog");
  await expect(details).toBeVisible();
  await expect(
    details.getByRole("heading", { name: "Share Your Work", exact: true }),
  ).toBeVisible();
  await expect(details.getByRole("heading", { name: "Open in Melt", exact: true })).toHaveCount(0);
  const alignment = await details.evaluate((dialog) => {
    const info = dialog.querySelector(".library-item-info")!;
    const title = info.firstElementChild!;
    const action = info.querySelector(".library-item-primary")!;
    const icon = action.querySelector("svg")!.getBoundingClientRect();
    const text = action.querySelector("span")!.getBoundingClientRect();
    const rect = dialog.getBoundingClientRect();
    const end = info.querySelectorAll('[data-slot="button"]')[1]!.getBoundingClientRect();
    return {
      firstIsTitle: title.getAttribute("data-slot") === "dialog-title",
      top: title.getBoundingClientRect().top - rect.top,
      bottom: rect.bottom - end.bottom,
      centerDelta: Math.abs(icon.top + icon.height / 2 - text.top - text.height / 2),
      weight: getComputedStyle(action).fontWeight,
    };
  });
  expect(alignment.firstIsTitle).toBe(true);
  expect(Math.abs(alignment.top - alignment.bottom)).toBeLessThan(2);
  expect(alignment.centerDelta).toBeLessThan(2);
  expect(alignment.weight).toBe("600");
  await page.screenshot({ path: "artifacts/library-feedback.png" });
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await preview.hover();
  await expect(preview).toHaveAttribute("data-preview-status", "idle");
  await expect(preview.locator(".motion-preview-hint")).not.toBeVisible();
  await card.getByRole("button", { name: "Play preview", exact: true }).click();
  await expect(preview).toHaveAttribute("data-preview-status", "playing");
  await page.mouse.move(10, 10);
  await expect(preview).toHaveAttribute("data-preview-status", "idle");
  expect(errors).toEqual([]);
});
