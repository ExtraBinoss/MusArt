import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("T draws a true text frame, previews without editor commits and cancels stale or escaped drafts", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const project = createProject({ pages: [createPage({ width: 640, height: 480, layers: [] })] });
  await page.evaluate((project) => window.musart!.load(project), project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("t");
  const bounds = (await page.getByTestId("artboard").boundingBox())!;
  const start = { x: bounds.x + 480, y: bounds.y + 340 },
    end = { x: bounds.x + 160, y: bounds.y + 140 };
  const counters = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            document.querySelector<HTMLElement>(selector)!.dataset.reactRenders,
          ],
        ),
      ),
    );
  const before = await counters();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(end.x, end.y, { steps: 12 });
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers),
  ).toHaveLength(0);
  expect(await counters()).toEqual(before);
  await page.keyboard.up("Shift");
  await page.mouse.up();
  const inserted = await page.evaluate(() => window.musart!.snapshot());
  expect(inserted.project.pages[0]!.layers[0]).toMatchObject({
    kind: "text",
    width: 320,
    height: 200,
  });
  expect(Math.abs(inserted.project.pages[0]!.layers[0]!.x - 160)).toBeLessThan(0.01);
  expect(Math.abs(inserted.project.pages[0]!.layers[0]!.y - 140)).toBeLessThan(0.01);
  expect(inserted.selection).toEqual([inserted.project.pages[0]!.layers[0]!.id]);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/text-drawn-frame.png" });
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  for (const cancellation of ["escape", "replacement"] as const) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 3 });
    if (cancellation === "escape") await page.keyboard.press("Escape");
    else
      await page.evaluate(
        (project) => window.musart!.load({ ...project, id: "replacement" }),
        project,
      );
    await page.mouse.up();
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers),
    ).toHaveLength(0);
  }
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
