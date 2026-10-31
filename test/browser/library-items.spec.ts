import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

const project = () =>
  createProject({
    id: crypto.randomUUID(),
    name: "Favorite motion",
    pages: [
      createPage({
        id: "motion-page",
        width: 320,
        height: 240,
        layers: [
          createLayer("rectangle", {
            id: "subject",
            x: 40,
            y: 40,
            width: 100,
            height: 100,
            fill: "#8b5cf6",
          }),
        ],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 3, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "track",
              layerId: "subject",
              start: { value: 0, rate: 1 },
              end: { value: 3, rate: 1 },
              properties: [
                {
                  id: "x-position",
                  target: { kind: "layer", layerId: "subject", property: "x" },
                  keyframes: [
                    { id: "a", time: { value: 0, rate: 1 }, value: 40 },
                    { id: "b", time: { value: 3, rate: 1 }, value: 160 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ],
  });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
});

test("library single click inspects, favorites survive reload, and direct/double clicks open", async ({
  page,
}) => {
  test.setTimeout(60000);
  const original = project();
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  }, original);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  const dashboard = page.locator(".project-dashboard");
  await expect(dashboard).toBeVisible();
  const card = dashboard.locator(".project-card").filter({ hasText: "Favorite motion" });
  await card.locator(".project-preview-open").click();
  const detail = page.locator(".library-item-dialog");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("ExtraBinoss");
  await expect(detail.getByRole("button", { name: "Open in Melt", exact: true })).toBeVisible();
  const left = (await detail.locator(".library-item-info").boundingBox())!,
    right = (await detail.locator(".library-item-preview").boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x + left.width);
  await page.screenshot({ path: "artifacts/library-refresh/library-detail.png" });
  expect(await page.evaluate(() => window.musart!.snapshot().project.id)).toBe(original.id);
  await detail.getByRole("button", { name: "Add to favorites", exact: true }).click();
  await expect(
    detail.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(dashboard.locator(".project-card").first()).toContainText("Favorite motion");
  await expect(
    dashboard.locator(".project-card").first().locator(".library-favorite-badge"),
  ).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await expect(
    page.locator(".project-card").first().locator(".library-favorite-badge"),
  ).toBeVisible();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const tile = page.locator(".template-card").first();
  const name = await tile.locator(".template-title").textContent();
  await tile.click();
  await expect(detail).toContainText(name!);
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => window.musart!.snapshot().project.id);
  await tile.dblclick();
  await expect(dashboard).toHaveCount(0);
  expect(await page.evaluate(() => window.musart!.snapshot().project.id)).not.toBe(before);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  await page.locator(".template-card-entry .library-item-open").first().click();
  await expect(dashboard).toHaveCount(0);
});

test("Motion previews resume under a stationary cursor and the brand/search stay consistent", async ({
  page,
}) => {
  test.setTimeout(60000);
  const original = project();
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    window.musart!.select(["subject"]);
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  }, original);
  await page
    .locator(".layer-animations")
    .getByRole("button", { name: "Add motion", exact: true })
    .click();
  const picker = page.locator(".motion-animation-popover"),
    search = picker.getByRole("searchbox", { name: "Search animations…", exact: true });
  await expect(search).toBeVisible();
  await expect.poll(() => search.getAttribute("placeholder")).not.toBe("Search…");
  await expect(picker.locator("input[type=search] + span img")).toHaveCount(0);
  const first = picker.locator(".animation-preset-card").first();
  await first.hover();
  await expect(first.locator("canvas")).toBeVisible();
  await page.mouse.wheel(0, 178);
  const hovered = picker.locator(".animation-preset-card:hover");
  await expect(hovered.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => Number(await hovered.locator("canvas").getAttribute("data-preview-frames")))
    .toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  const editorBrand = page.getByRole("button", { name: "Project menu", exact: true });
  await editorBrand.hover();
  const editorBody = editorBrand.locator('[data-mascot-part="body"]');
  const editorShape = await editorBody.getAttribute("d");
  await expect.poll(() => editorBody.getAttribute("d")).not.toBe(editorShape);
  const editorColor = await editorBrand
    .locator("svg")
    .evaluate((node) => getComputedStyle(node).color);
  const primary = await editorBrand.evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--brand-primary)";
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(editorColor).toBe(primary);
  await editorBrand.click();
  const brand = page.locator(".dashboard-brand");
  await expect(brand).toHaveCSS("font-family", /Clash Display/);
  await page.evaluate(() => document.fonts.load('600 22px "Clash Display"'));
  expect(await page.evaluate(() => document.fonts.check('600 22px "Clash Display"'))).toBe(true);
  await expect(brand.locator("svg")).toHaveCSS("color", editorColor);
  await brand.hover();
  const mascot = brand.locator("[data-mascot-part=body]");
  const initial = await mascot.getAttribute("d");
  await expect.poll(() => mascot.getAttribute("d")).not.toBe(initial);
  await expect(mascot).toHaveAttribute("fill", /^url\(#/);
  const saved = page.locator(".project-card").filter({ hasText: "Favorite motion" });
  await saved.locator(".project-preview-open").hover();
  await expect(saved.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  await expect
    .poll(async () =>
      Number(
        await saved.locator(".motion-template-preview-canvas").getAttribute("data-preview-time"),
      ),
    )
    .toBeGreaterThan(0);
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const template = page.locator(".template-card-entry").filter({
    has: page.getByRole("button", {
      name: "Create from In Bloom — Motion showcase",
      exact: true,
    }),
  });
  let release!: () => void;
  const download = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/templates/motion/in-bloom.json", async (route) => {
    await download;
    await route.continue();
  });
  try {
    await template.locator(".template-card").hover();
    await expect(template.locator(".motion-template-preview")).toHaveAttribute(
      "data-preview-status",
      "loading",
    );
    const indicator = template.locator(".motion-template-preview-loading-mark");
    await expect(indicator).toBeVisible();
    const indicatorBox = (await indicator.boundingBox())!,
      cardBox = (await template.boundingBox())!;
    expect(indicatorBox.width).toBeLessThanOrEqual(24);
    expect(indicatorBox.y - cardBox.y).toBeLessThan(20);
    expect(cardBox.x + cardBox.width - indicatorBox.x).toBeLessThan(85);
  } finally {
    release();
  }

  await expect(template.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
    { timeout: 20000 },
  );
  expect(await page.evaluate(() => window.musart!.snapshot().project.id)).toBe(original.id);
  await page.screenshot({ path: "artifacts/library-refresh/library-hover.png" });
});
