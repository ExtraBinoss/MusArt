import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("registered designed Motion cards and Melt Mascot preview and open through their actual loaders", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ layers: [createLayer("rectangle")] })] }),
  );
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const requested: string[] = [];
  page.on("request", (request) => {
    if (/templates\/.*\.json/.test(request.url())) requested.push(new URL(request.url()).pathname);
  });
  for (const [name, folder, id] of [
    ["Orbit Study", "designed", "orbit-study"],
    ["Paper Motion", "designed", "paper-motion"],
    ["Transition Atlas", "designed", "transition-atlas"],
    ["Melt Mascot", "motion", "morphing-type"],
  ] as const) {
    const tile = page
      .locator(".template-card-entry")
      .filter({ has: page.getByRole("button", { name: `Preview ${name}`, exact: true }) });
    await tile.locator(".template-card").hover();
    const preview = tile.locator(".motion-template-preview");
    await expect(preview).toHaveAttribute("data-preview-status", "playing", { timeout: 20000 });
    await expect
      .poll(async () =>
        Number(
          await preview
            .locator(".motion-template-preview-canvas")
            .getAttribute("data-preview-time"),
        ),
      )
      .toBeGreaterThan(0);
    expect(requested).toContain(`/templates/${folder}/${id}.json`);
    await page.locator(".dashboard-brand").hover();
    await expect(preview).toHaveAttribute("data-preview-status", "idle");
  }
  const card = page
    .locator(".template-card-entry")
    .filter({ has: page.getByRole("button", { name: "Preview Melt Mascot", exact: true }) });
  await card.locator(".library-item-open").click();
  await expect(page.locator(".project-dashboard")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.name))
    .toBe("Melt Mascot");
  const project = await page.evaluate(() => window.musart!.snapshot().project);
  expect(project.pages[0]!.layers).toHaveLength(5);
  expect(project.pages[0]!.layers[0]).toMatchObject({ kind: "vector", name: "Melt mascot" });
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
});
