import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("live peek, pin, resize grip and the compact bottom scrollbar stay coordinated", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layers = Array.from({ length: 36 }, (_, index) =>
    createLayer("rectangle", {
      id: `tile-${index}`,
      name: `Tile ${index}`,
      width: 32,
      height: 32,
      x: (index % 9) * 40,
      y: Math.floor(index / 9) * 40,
    }),
  );
  const project = createProject({
    pages: [
      createPage({
        id: "dock-page",
        width: 640,
        height: 360,
        layers,
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 10, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: layers.map((layer) => ({
            id: `track-${layer.id}`,
            layerId: layer.id,
            start: { value: 0, rate: 1 },
            end: null,
            properties: [],
          })),
        },
      }),
    ],
  });
  await page.evaluate((document) => window.musart!.load(document), project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  const dock = page.locator(".motion-timeline-dock"),
    panel = page.locator(".motion-timeline");
  await expect(dock).toHaveAttribute("data-motion-presence", "peek");
  const toggleShadow = await page
    .locator(".canvas-timeline-toggle")
    .evaluate((node) => getComputedStyle(node).boxShadow);
  await expect(page.getByRole("button", { name: "Lire", exact: true })).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Se déplacer dans la timeline", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Ouvrir|Fermer) la timeline$/ })).toHaveCount(0);
  const canvas = page.locator(".workspace-panels"),
    originalHeight = (await canvas.boundingBox())!.height;
  const header = (await page.locator(".motion-ruler").boundingBox())!;
  await page.mouse.move(header.x + 60, header.y + 10);
  await expect(dock).toHaveAttribute("data-motion-expanded", "true");
  await expect(dock).toHaveAttribute("data-motion-animating", "true");
  await expect(page.locator(".motion-resize .panel-divider-grip")).toHaveCSS("opacity", "0");
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  await expect(page.locator(".motion-resize .panel-divider-grip")).toHaveCSS("opacity", "1");
  expect((await canvas.boundingBox())!.height).toBe(originalHeight);
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect(dock).toHaveAttribute("data-motion-pinned", "true");
  await expect(page.locator(".canvas-timeline-toggle")).toHaveCSS("box-shadow", "none");
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  expect((await canvas.boundingBox())!.height).toBeLessThan(originalHeight - 120);
  expect(await dock.evaluate((node) => Number(getComputedStyle(node).zIndex))).toBeGreaterThan(25);
  const zoom = page.getByRole("slider", { name: "Zoom de la timeline", exact: true });
  await zoom.focus();
  await page.keyboard.press("End");
  const viewport = page.locator(".motion-timeline-scroll");
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollWidth - node.clientWidth))
    .toBeGreaterThan(1000);
  const geometry = await viewport.boundingBox();
  await page.mouse.move(300, 100);
  await mkdir("artifacts/motion/ui", { recursive: true });
  await panel.screenshot({ path: "artifacts/motion/ui/dock-pinned-dark.png" });
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
  expect(await viewport.boundingBox()).toEqual(geometry);
  await page.screenshot({ path: "artifacts/motion/ui/dock-scrollbar-hover-dark.png" });
  await page.locator(".canvas-timeline-toggle").click();
  await expect(dock).toHaveAttribute("data-motion-pinned", "false");
  await expect(dock).toHaveAttribute("data-motion-presence", "peek");
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  expect((await canvas.boundingBox())!.height).toBe(originalHeight);
  await expect(page.getByRole("button", { name: "Lire", exact: true })).toBeVisible();
  await expect(page.locator(".canvas-timeline-toggle")).toHaveCSS("box-shadow", toggleShadow);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});
