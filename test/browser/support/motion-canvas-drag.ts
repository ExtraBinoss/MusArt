import { expect as baseExpect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { assertDropPlacement } from "./drop-placement";
import { installNativeDragProbe, assertNativeMove } from "./native-drag";
import {
  output,
  prepare,
  reorderFixture,
  point,
  frames,
  counters,
  revision,
  undo,
} from "./motion-canvas";

const expect = baseExpect.configure({ timeout: 3500 });

export async function verifyCanvasReorder(page: Page) {
  await prepare(page, reorderFixture());
  const label = (id: string) =>
    `.motion-row[data-labels-only=true]:not(.is-property)[data-layer-id="${id}"]`;
  const order = (sidebar = false) =>
    page.evaluate((sidebar) => {
      const selector = sidebar
        ? ".layers-panel .layer-row[data-layer-id]"
        : ".motion-row[data-labels-only=true]:not(.is-property)[data-layer-id]";
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((node) => ["card", "peer"].includes(node.dataset.layerId!))
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map((node) => node.dataset.layerId);
    }, sidebar);
  const original = await page.evaluate(() => window.musart!.snapshot().project);
  for (const [source, target, edge] of [
    ["card", "peer", 9],
    ["peer", "card", -9],
  ] as const) {
    const a = await point(page, label(source), 3),
      b = await point(page, label(target), 3, edge);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await expect(page.locator(".inspector")).toHaveAttribute("data-selected-layer-id", source);
    await frames(page);
    const quiet = await counters(page),
      before = await revision(page);
    const canvas = page.locator('.canvas-artboard canvas[data-renderer-ready="true"]');
    const prior =
      source === "card" ? await canvas.screenshot({ path: `${output}/stack-before.png` }) : null;
    await page.mouse.move(a.x + 1, b.y, { steps: 6 });
    await expect(page.locator(label(source))).toHaveAttribute("data-layer-reorder-source", "true");
    await expect.poll(() => order()).toEqual(["card", "peer"]);
    await expect.poll(() => order(true)).toEqual(["card", "peer"]);
    expect(await counters(page)).toEqual(quiet);
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original);
    await page.screenshot({ path: `${output}/bar-${source}-reorder-draft.png` });
    await page.mouse.up();
    await assertDropPlacement(
      page,
      page.locator(label(source)),
      `${output}/drop-halo-${source}.png`,
    );
    await expect.poll(() => revision(page)).toBe(before + 1);
    const committed = await page.evaluate(() => window.musart!.snapshot().project);
    expect(committed.pages[0]!.layers.map((layer) => layer.id)).toEqual(["card", "peer"]);
    expect(committed.pages[0]!.motion).toEqual(original.pages[0]!.motion);
    await expect(canvas).toHaveAttribute("data-canonical-revision", String(before + 1));
    if (prior) {
      const next = await canvas.screenshot({ path: `${output}/stack-after.png` });
      expect(next.equals(prior)).toBe(false);
    }
    await undo(page);
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original);
    await expect.poll(() => order()).toEqual(["card", "peer"]);
  }

  await installNativeDragProbe(page, "application/x-musart-layer", ".motion-canvas-root");
  const gutter = page.locator(label("card")).locator(".motion-row-label");
  await expect(gutter).toHaveAttribute("draggable", "true");
  const a = (await gutter.boundingBox())!,
    b = await point(page, label("peer"), 3, 9);
  const before = await revision(page);
  await page.mouse.move(a.x + 100, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 125, a.y + a.height / 2, { steps: 3 });
  await frames(page);
  const quiet = await counters(page);
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.move(b.x + 1, b.y);
  await expect(page.locator("[data-timeline-drop-target]:not([hidden])")).toHaveAttribute(
    "data-layer-drop-kind",
    "layer",
  );
  // The proxy follows the stationary canonical row under the pointer.
  await expect(page.locator("[data-timeline-drop-target]:not([hidden])")).toHaveAttribute(
    "data-motion-row-key",
    "peer",
  );
  await expect.poll(() => order()).toEqual(["card", "peer"]);
  expect(await counters(page)).toEqual(quiet);
  await page.screenshot({ path: `${output}/gutter-native-drop-draft.png` });
  await page.mouse.up();
  await frames(page);
  await writeFile(
    `${output}/drop-debug.json`,
    JSON.stringify(
      await page.evaluate(() => ({
        samples: (window as unknown as { __musartDragProbe: unknown[] }).__musartDragProbe,
        revision: window.musart!.snapshot().revision,
        order: window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.id),
      })),
      null,
      2,
    ),
  );
  const samples = await assertNativeMove(page, "card");
  await expect.poll(() => revision(page)).toBe(before + 1);
  const dropped = await page.evaluate(() => window.musart!.snapshot().project);
  expect(dropped.pages[0]!.layers.map((layer) => layer.id)).toEqual(["card", "peer"]);
  expect(dropped.pages[0]!.motion).toEqual(original.pages[0]!.motion);
  await expect.poll(() => order(true)).toEqual(["peer", "card"]);
  await undo(page);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original);
  await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
  await writeFile(
    `${output}/native-canvas-drop.json`,
    JSON.stringify({ samples, before, after: await revision(page) }, null, 2),
  );
}
