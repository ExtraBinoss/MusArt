import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const counters = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => [
          selector,
          document.querySelector(selector)?.getAttribute("data-react-renders"),
        ],
      ),
    ),
  );

test("authored Motion cards play genuine GPU frames on hover without editing the project or rebuilding the editor", async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    async (project) => {
      window.musart!.load(project);
      await window.musart!.save();
      await window.musart!.flushThumbnails();
    },
    createProject({
      id: "preview-owner",
      name: "Preview owner",
      pages: [
        createPage({
          width: 400,
          height: 300,
          layers: [
            createLayer("rectangle", {
              id: "preview-witness",
              x: 40,
              y: 40,
              width: 100,
              height: 80,
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  await page
    .locator(".library-sidebar")
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  const search = page.getByRole("searchbox", { name: "Rechercher un modèle" });
  await expect(search).toBeVisible();
  const input = await search.elementHandle();
  await page.getByRole("radio", { name: "Motion", exact: true }).click();
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  const renders = await counters(page);
  for (const name of ["In Bloom — Démo Motion", "Laboratoire Motion"]) {
    const card = page.getByRole("button", { name: `Créer depuis ${name}`, exact: true });
    const preview = card.locator(".motion-template-preview");
    await card.hover();
    await expect(preview).toHaveAttribute("data-preview-status", "playing");
    const canvas = preview.locator("canvas");
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBeLessThanOrEqual(480);
    const host = preview.locator(".motion-template-preview-canvas");
    await expect
      .poll(async () => Number(await host.getAttribute("data-preview-time")))
      .toBeGreaterThan(0.15);
    const first = await canvas.screenshot();
    const time = Number(await host.getAttribute("data-preview-time"));
    await expect
      .poll(async () => Number(await host.getAttribute("data-preview-time")))
      .toBeGreaterThan(time + 0.25);
    const second = await canvas.screenshot({
      path: info.outputPath(`${name.startsWith("In") ? "bloom" : "stress"}-playing.png`),
    });
    expect(second.equals(first)).toBe(false);
    expect(await counters(page)).toEqual(renders);
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
    await search.hover();
    await expect(preview).toHaveAttribute("data-preview-status", "idle");
    await expect(preview.locator("canvas")).toHaveCount(0);
    const stopped = await host.getAttribute("data-preview-time");
    await page.waitForTimeout(100);
    expect(await host.getAttribute("data-preview-time")).toBe(stopped);
  }
  expect(
    await search
      .elementHandle()
      .then((node) => node!.evaluate((el, previous) => el === previous, input)),
  ).toBe(true);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({
    gpu: reads.gpu,
    webgl: reads.webgl,
    canvas: reads.canvas,
    video: reads.videoFrame,
  }).toEqual({ gpu: 0, webgl: 0, canvas: 0, video: 0 });
  await info.attach("preview-verification", {
    body: JSON.stringify(
      {
        browser: browser.version(),
        viewport: { width: 1280, height: 900 },
        renders,
        readbacks: reads,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
