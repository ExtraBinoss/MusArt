import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function at(page: Page, x: number, y: number) {
  const board = page.getByTestId("artboard"),
    box = (await board.boundingBox())!;
  return { x: box.x + (box.width * x) / 640, y: box.y + (box.height * y) / 480 };
}
async function dragBox(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

test("canvas modifier clicks toggle selection and right-drag selects crossing layers without document edits or held React commits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          width: 640,
          height: 480,
          layers: [
            createLayer("rectangle", {
              id: "a",
              x: 40,
              y: 40,
              width: 120,
              height: 120,
              fill: "#2b60ff",
            }),
            createLayer("rectangle", {
              id: "b",
              x: 240,
              y: 60,
              width: 120,
              height: 120,
              fill: "#e97344",
            }),
            createLayer("rectangle", {
              id: "locked",
              x: 440,
              y: 40,
              width: 120,
              height: 120,
              locked: true,
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]')).toBeVisible();
  const a = await at(page, 80, 80),
    b = await at(page, 280, 100);
  const selection = () => page.evaluate(() => window.musart!.snapshot().selection);
  await page.mouse.click(a.x, a.y);
  expect(await selection()).toEqual(["a"]);
  for (const modifier of ["Control", "Meta", "Shift"]) {
    await page.keyboard.down(modifier);
    await page.mouse.click(b.x, b.y);
    expect(await selection()).toEqual(["a", "b"]);
    await page.mouse.click(b.x, b.y);
    expect(await selection()).toEqual(["a"]);
    await page.keyboard.up(modifier);
  }
  const from = await at(page, 100, 100),
    to = await at(page, 500, 140);
  const before = await page.evaluate(() => window.musart!.snapshot());
  const counters = () =>
    page.evaluate(() => ({
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
          ],
        ),
      ),
      gpu: JSON.parse(
        document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!.dataset.gpuStats!,
      ),
    }));
  // A stationary secondary click preserves the selected layer and opens no native/app menu.
  await page.mouse.click(b.x, b.y, { button: "right" });
  expect(await selection()).toEqual(["a"]);
  await expect(page.getByRole("menu")).toHaveCount(0);
  const baseline = await counters();
  await dragBox(page, from, to);
  await expect(page.locator(".canvas-marquee")).toBeVisible();
  const held = await counters();
  expect(held.commits).toEqual(baseline.commits);
  expect(held.gpu.submitted).toBe(baseline.gpu.submitted);
  expect(await selection()).toEqual(["a"]);
  await page.screenshot({ path: "artifacts/screenshots/right-drag-selection-held.png" });
  await page.mouse.up({ button: "right" });
  expect(await selection()).toEqual(["a", "b"]);
  await expect(page.locator(".canvas-marquee")).not.toBeVisible();
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.project).toEqual(before.project);
  expect(after.canUndo).toBe(false);
  expect(after.revision).toBe(before.revision);

  await page.evaluate(() => window.musart!.select(["b"]));
  await page.keyboard.down("Control");
  await dragBox(page, await at(page, 100, 100), await at(page, 180, 180));
  await page.mouse.up({ button: "right" });
  await page.keyboard.up("Control");
  expect(await selection()).toEqual(["b", "a"]);
  await dragBox(page, from, to);
  await page.keyboard.press("Escape");
  await page.mouse.up({ button: "right" });
  expect(await selection()).toEqual(["b", "a"]);
  await expect(page.locator(".canvas-marquee")).not.toBeVisible();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});

test("right-clicking an inactive artboard is inert until a real drag activates and rebases its marquee", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          id: "first",
          width: 320,
          height: 240,
          layers: [
            createLayer("rectangle", { id: "first-layer", x: 30, y: 30, width: 80, height: 80 }),
          ],
        }),
        createPage({
          id: "second",
          width: 320,
          height: 240,
          layers: [
            createLayer("rectangle", {
              id: "second-layer",
              x: 40,
              y: 40,
              width: 120,
              height: 120,
              fill: "#e97344",
            }),
            createLayer("rectangle", { id: "second-other", x: 220, y: 40, width: 80, height: 80 }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.evaluate(() => window.musart!.select(["first-layer"]));
  const before = await page.evaluate(() => window.musart!.snapshot());
  const second = page.locator('.canvas-artboard-backdrop[data-artboard-id="second"]');
  const bounds = (await second.boundingBox())!;
  const from = {
    x: bounds.x + (bounds.width * 60) / 320,
    y: bounds.y + (bounds.height * 60) / 240,
  };
  const to = {
    x: bounds.x + (bounds.width * 100) / 320,
    y: bounds.y + (bounds.height * 100) / 240,
  };
  await page.mouse.click(from.x, from.y, { button: "right" });
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".canvas-marquee")).not.toBeVisible();

  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(from.x + 1, from.y + 1);
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  await expect(page.locator(".canvas-marquee")).not.toBeVisible();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-artboard-id", "second");
  await expect(page.locator(".canvas-marquee")).toBeVisible();
  for (const [property, value] of Object.entries({
    left: "60px",
    top: "60px",
    width: "40px",
    height: "40px",
  }))
    await expect
      .poll(async () =>
        parseFloat(
          await page
            .locator(".canvas-marquee")
            .evaluate((element, key) => getComputedStyle(element).getPropertyValue(key), property),
        ),
      )
      .toBeCloseTo(parseFloat(value), 1);
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([]);
  await page.screenshot({ path: "artifacts/screenshots/inactive-artboard-right-drag-held.png" });
  await page.mouse.up({ button: "right" });
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.pageId).toBe("second");
  expect(after.selection).toEqual(["second-layer"]);
  expect(after.project).toEqual(before.project);
  expect(after.revision).toBe(before.revision);
  expect(after.canUndo).toBe(false);
  await expect(page.locator(".canvas-marquee")).not.toBeVisible();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});
