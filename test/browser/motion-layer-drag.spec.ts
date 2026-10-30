import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject, type CompositionMotion } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installNativeDragProbe, assertNativeMove } from "./support/native-drag";
import { installReadbackProbe } from "./support/readback-probe";

const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
function fixture(count = 2) {
  const layers = [
    createLayer("group", { id: "reorder-group", name: "Animated group", width: 320, height: 220 }),
    ...Array.from({ length: count }, (_, index) =>
      createLayer(index % 2 ? "ellipse" : "rectangle", {
        id: `reorder-${index}`,
        parentId: "reorder-group",
        name: `Layer ${index}`,
        x: 10 + (index % 4) * 70,
        y: 15 + (index % 3) * 50,
        width: 60,
        height: 60,
        fill: index % 2 ? "#ce957a" : "#789570",
      }),
    ),
  ];
  const motion: CompositionMotion = {
    version: 1,
    initialized: true,
    mode: "motion",
    duration: { value: 2, rate: 1 },
    frameRate: { numerator: 30, denominator: 1 },
    tracks: layers.map((layer) => ({
      id: `track-${layer.id}`,
      layerId: layer.id,
      start: { value: 0, rate: 1 },
      end: null,
      properties:
        layer.id === "reorder-0"
          ? [
              {
                id: "animated-x",
                target: { kind: "layer" as const, layerId: layer.id, property: "x" as const },
                keyframes: [
                  { id: "x-start", time: { value: 0, rate: 1 }, value: 10 },
                  { id: "x-end", time: { value: 2, rate: 1 }, value: 100 },
                ],
              },
            ]
          : [],
    })),
  };
  return createProject({
    name: "Shared layer drag",
    pages: [
      createPage({
        id: "reorder-board",
        width: 440,
        height: 300,
        background: "#17231c",
        layers,
        motion,
      }),
    ],
  });
}
async function load(page: Page, count = 2) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), fixture(count));
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
  await expect(page.locator(".motion-timeline-dock")).not.toHaveAttribute("data-motion-animating");
}
async function counters(page: Page) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
        ]),
      ),
    roots,
  );
}
async function evidence(page: Page, name: string, data: object) {
  await mkdir("artifacts/motion/drag", { recursive: true });
  await writeFile(
    `artifacts/motion/drag/${name}.json`,
    JSON.stringify(
      {
        ...data,
        ...(await page.evaluate(() => ({
          readbacks: window.__musartVideoReadbacks,
          snapshot: window.musart!.snapshot(),
        }))),
      },
      null,
      2,
    ),
  );
}
const row = (page: Page, id: string) =>
  page.locator(`.motion-row:not(.is-property)[data-layer-id="${id}"]`);

test("native timeline gutter reorders through the same Layers controller and retains animated hierarchy", async ({
  page,
  browser,
}) => {
  test.setTimeout(45_000);
  await load(page);
  const source = row(page, "reorder-0").locator(".motion-row-label");
  const target = page.locator('.layers-panel .layer-row[data-layer-id="reorder-1"]');
  await expect(source).toHaveAttribute("draggable", "true");
  await expect(page.locator(".motion-row.is-property .motion-row-label")).toHaveAttribute(
    "draggable",
    "false",
  );
  const before = await page.evaluate(() => window.musart!.snapshot());
  const quiet = await counters(page);
  await installNativeDragProbe(page, "application/x-musart-layer");
  const a = (await source.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 130, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + 150, a.y + 12, { steps: 3 });
  await page.mouse.move(b.x + 130, b.y + 3, { steps: 6 });
  await page.mouse.move(b.x + 131, b.y + 3);
  await expect(target).toHaveClass(/drop-before/);
  expect(await counters(page)).toEqual(quiet);
  await page.screenshot({ path: "artifacts/motion/ui/shared-layer-native-drag.png" });
  await page.mouse.up();
  const samples = await assertNativeMove(page, "reorder-0");
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.revision).toBe(before.revision + 1);
  expect(after.project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "reorder-group",
    "reorder-1",
    "reorder-0",
  ]);
  expect(after.project.pages[0]!.motion).toEqual(before.project.pages[0]!.motion);
  await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
  const restored = await page.evaluate(() => {
    window.musart!.undo();
    return window.musart!.snapshot();
  });
  expect(restored.project).toEqual(before.project);
  await evidence(page, "timeline-gutter-native", { browser: browser.version(), samples, quiet });
});

test("whole clip bars choose vertical stacking or horizontal time once, with one undo and clean cancel", async ({
  page,
  browser,
}) => {
  test.setTimeout(45_000);
  await load(page);
  const source = row(page, "reorder-0").locator(".motion-track"),
    target = row(page, "reorder-1").locator(".motion-track");
  const before = await page.evaluate(() => window.musart!.snapshot());
  const a = (await source.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 80, a.y + 8);
  await page.mouse.down();
  await expect(page.locator(".inspector")).toHaveAttribute("data-selected-layer-id", "reorder-0");
  const quiet = await counters(page);
  await page.mouse.move(a.x + 81, b.y + 3, { steps: 8 });
  await expect(row(page, "reorder-0")).toHaveAttribute("data-layer-reorder-source", "true");
  await expect(row(page, "reorder-1")).toHaveAttribute("data-layer-reorder-target", "before");
  expect(await counters(page)).toEqual(quiet);
  await page.screenshot({ path: "artifacts/motion/ui/shared-layer-bar-drag.png" });
  await page.mouse.up();
  const stacked = await page.evaluate(() => window.musart!.snapshot());
  expect(stacked.revision).toBe(before.revision + 1);
  expect(stacked.project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "reorder-group",
    "reorder-1",
    "reorder-0",
  ]);
  expect(stacked.project.pages[0]!.motion).toEqual(before.project.pages[0]!.motion);
  await page.evaluate(() => window.musart!.undo());
  const c = (await source.boundingBox())!;
  await page.mouse.move(c.x + 80, c.y + 8);
  await page.mouse.down();
  await page.mouse.move(c.x + 140, c.y + 9, { steps: 8 });
  await page.mouse.up();
  const timed = await page.evaluate(() => window.musart!.snapshot());
  expect(timed.project.pages[0]!.layers.map((layer) => layer.id)).toEqual(
    before.project.pages[0]!.layers.map((layer) => layer.id),
  );
  expect(
    timed.project.pages[0]!.motion!.tracks.find((track) => track.layerId === "reorder-0")!.start,
  ).toEqual({ value: 1, rate: 2 });
  const restored = await page.evaluate(() => {
    window.musart!.undo();
    return window.musart!.snapshot();
  });
  expect(restored.project).toEqual(before.project);
  const e = (await source.boundingBox())!;
  await page.mouse.move(e.x + 80, e.y + 8);
  await page.mouse.down();
  await page.mouse.move(e.x + 81, (await target.boundingBox())!.y + 3, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
  await evidence(page, "timeline-bar-pointer", { browser: browser.version(), quiet });
});

test("vertical clip autoscroll retains the captured source and a bounded virtual window", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await load(page, 150);
  const source = row(page, "reorder-149").locator(".motion-track"),
    scroll = page.locator(".motion-timeline-scroll");
  const a = (await source.boundingBox())!,
    bounds = (await scroll.boundingBox())!;
  await page.mouse.move(a.x + 80, a.y + 8);
  await page.mouse.down();
  await page.mouse.move(a.x + 81, bounds.y + bounds.height - 9, { steps: 10 });
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(40);
  await expect(row(page, "reorder-149")).toHaveAttribute("data-layer-reorder-source", "true");
  expect(await page.locator(".motion-row").count()).toBeLessThan(40);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
  const stopped = await scroll.evaluate((node) => node.scrollTop);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(stopped);
  await evidence(page, "timeline-vertical-autoscroll", { stopped });
});
