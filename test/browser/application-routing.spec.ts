import { expect, test } from "@playwright/test";

test("public landing has server HTML; dashboard/editor links preserve the runtime and saved identity", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration/i.test(message.text()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const html = await (await request.get("./")).text();
  expect(html).toContain("Créez. Animez.");
  expect(html).toContain("og:description");
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Create. Animate." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open editor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try Melt", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".project-dashboard")).toBeVisible();
  await expect(page.locator(".landing-page")).toHaveCount(0);
  await expect(page.locator('.library-navigation-item[aria-current="page"]')).toHaveText(
    "Templates",
  );
  await page.goto("./editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const id = await page.evaluate(async () => {
    const api = window.musart!;
    api.execute({ type: "renameProject", name: "Route identity" });
    await api.save();
    (window as unknown as { routeApi: unknown }).routeApi = api;
    return api.snapshot().project.id;
  });
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.locator('.canvas-artboard canvas[data-renderer-ready="true"]').evaluate((canvas) => {
    canvas.dataset.routeRetained = "true";
  });
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".project-dashboard")).toBeVisible();
  const project = page.locator(".project-card").filter({ hasText: "Route identity" });
  await project.locator(".library-item-open").click();
  await expect(page).toHaveURL(
    (url) => url.pathname.endsWith("/editor") && url.searchParams.get("project") === id,
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { routeApi: unknown }).routeApi === window.musart,
    ),
  ).toBe(true);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toHaveAttribute(
    "data-route-retained",
    "true",
  );
  await page.goto(`./editor?project=${id}&automation=1`);
  await page.waitForFunction(() => !!window.musart);
  expect(await page.evaluate(() => window.musart!.snapshot().project.id)).toBe(id);
  await expect(page.locator(".project-dashboard")).toHaveCount(0);
  expect(errors).toEqual([]);
});
