import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { openProjectLibrary } from "./support/project-library";
import { installReadbackProbe } from "./support/readback-probe";

async function commits(page: Page) {
  return page
    .locator(".musart-app, .canvas-area, .editor-canvas, .editor-gpu-scene")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        className: node.className,
        renders: node.getAttribute("data-react-renders"),
      })),
    );
}
test("mobile library shares the bottom navigation, swipes once without editor commits and opens preferences", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "library-navigation",
      name: "Library navigation",
      pages: [
        createPage({
          id: "library-navigation-page",
          width: 320,
          height: 240,
          layers: [
            createLayer("rectangle", {
              id: "library-navigation-layer",
              x: 20,
              y: 20,
              width: 80,
              height: 60,
              fill: "#e7967a",
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await openProjectLibrary(page);
  const nav = page.locator(".mobile-library-nav");
  await expect(nav.getByRole("button", { name: "Projets", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    nav.getByRole("button", { name: "Communauté · Bientôt", exact: true }),
  ).toBeDisabled();
  await expect(nav.getByRole("button")).toHaveCount(4);
  await expect(page.locator(".dashboard-navigation:visible")).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Rechercher un projet" });
  await search.fill("draft");
  const input = await search.elementHandle();
  await search.blur();
  const before = await commits(page);
  const documentBefore = await page.evaluate(() => window.musart!.snapshot().project);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", x = 0, y = 420) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1 }],
    });
  await touch("touchStart", 310);
  await touch("touchMove", 230);
  await expect(nav.getByRole("button", { name: "Projets", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await commits(page)).toEqual(before);
  expect(
    await page
      .locator(".dashboard-grid-stage")
      .evaluate((node) => getComputedStyle(node).transform),
  ).not.toBe("none");
  await touch("touchMove", 120);
  await touch("touchEnd");
  await expect(nav.getByRole("button", { name: "Templates", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".dashboard-grid-stage")).toHaveCSS("transform", "none");
  expect(
    await page.getByRole("searchbox").evaluate((node, previous) => node === previous, input),
  ).toBe(true);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.getByRole("searchbox").fill("Bloom");
  await nav.getByRole("button", { name: "Projets", exact: true }).click();
  await expect(search).toHaveValue("draft");
  await touch("touchStart", 310);
  await touch("touchMove", 120);
  await touch("touchCancel");
  await expect(nav.getByRole("button", { name: "Projets", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("button", { name: "Préférences", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Préférences", exact: true });
  await expect(preferences).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preferences).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Projets", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(documentBefore);
  const bounds = await nav.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath("mobile-library.png") });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await cdp.detach();
});
