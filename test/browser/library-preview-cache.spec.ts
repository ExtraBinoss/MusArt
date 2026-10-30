import { expect, test } from "@playwright/test";

test("template hovers reuse the real GPU canvas and validated sources across cards", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/templates\/.*\.json/.test(request.url())) requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const card = (name: string) =>
    page
      .locator(".template-card-entry")
      .filter({ has: page.getByRole("button", { name: `Preview ${name}`, exact: true }) });
  const morph = card("Morphing Type"),
    orbit = card("Orbit Study");
  await morph.locator(".template-card").hover();
  await expect(morph.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  await morph.locator("canvas").evaluate((canvas) => {
    canvas.dataset.retainedTest = "same-context";
  });
  await page.locator(".dashboard-brand").hover();
  await expect(morph.locator("canvas")).toHaveCount(0);
  await orbit.locator(".template-card").hover();
  await expect(orbit.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  await expect(orbit.locator("canvas")).toHaveAttribute("data-retained-test", "same-context");
  await page.locator(".dashboard-brand").hover();
  await morph.locator(".template-card").hover();
  await expect(morph.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  await expect(morph.locator("canvas")).toHaveAttribute("data-retained-test", "same-context");
  await expect
    .poll(async () =>
      Number(
        await morph.locator(".motion-template-preview-canvas").getAttribute("data-preview-time"),
      ),
    )
    .toBeGreaterThan(0);
  expect(requests.filter((url) => url.endsWith("/morphing-type.json"))).toHaveLength(1);
  // Leaving stops frame scheduling. Re-entry restarts the same renderer at composition time zero.
  await page.locator(".dashboard-brand").hover();
  await expect(morph.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "idle",
  );
  expect(
    await morph.locator(".motion-template-preview-canvas").getAttribute("data-preview-time"),
  ).not.toBeNull();
});
