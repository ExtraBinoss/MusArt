import { expect, test } from "@playwright/test";

test("development console reports preview and template stages through the first real canvas frame", async ({
  page,
}) => {
  const groups: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "startGroupCollapsed") groups.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const card = page
    .locator(".template-card-entry")
    .filter({ has: page.getByRole("button", { name: "Preview Orbit Study", exact: true }) });
  await card.locator(".template-card").hover();
  await expect
    .poll(() =>
      groups.some(
        (text) => text.includes("Hover template orbit-study") && text.includes("(ready)"),
      ),
    )
    .toBe(true);
  await card.locator(".library-item-open").click();
  await expect
    .poll(() =>
      groups.some(
        (text) => text.includes("Open template: Orbit Study") && text.includes("(ready)"),
      ),
    )
    .toBe(true);
  expect(groups.every((text) => /\d+(?:\.\d+)? ms/.test(text))).toBe(true);
});
