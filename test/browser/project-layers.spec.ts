import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeDragProbe, assertNativeMove } from "./support/native-drag";
import { inspectImage } from "./support/image-probe";

async function ready(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
}
test("native thumbnail drop shows a floating mask cue and clips by shape alpha with one undo", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          width: 200,
          height: 200,
          background: "transparent",
          layers: [
            createLayer("rectangle", {
              id: "clip-shape",
              name: "Blue mask",
              x: 40,
              y: 50,
              width: 80,
              height: 60,
              fill: "#0000ff",
            }),
            createLayer("rectangle", {
              id: "clip-target",
              name: "Red artwork",
              x: 0,
              y: 0,
              width: 200,
              height: 200,
              fill: "#ff0000",
            }),
          ],
        }),
      ],
    }),
  );
  const source = page.locator('[data-layer-id="clip-shape"]'),
    target = page.locator('[data-layer-id="clip-target"]'),
    thumbnail = target.locator("[data-thumbnail-layer-id]");
  await expect(source).toBeVisible();
  await installNativeDragProbe(page, "application/x-musart-layer");
  const from = await source.boundingBox(),
    to = await thumbnail.boundingBox();
  if (!from || !to) throw Error("Missing native layer drag geometry");
  await page.mouse.move(from.x + 100, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 106, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2);
  const cue = page.getByRole("status").filter({ hasText: "Ajouter comme masque" });
  await expect(cue).toBeVisible();
  expect(await cue.evaluate((node) => node.parentElement === document.body)).toBe(true);
  expect(await cue.evaluate((node) => Number(getComputedStyle(node).zIndex))).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  await page.screenshot({ path: "artifacts/screenshots/layers-thumbnail-mask-held.png" });
  await page.mouse.up();
  await assertNativeMove(page, "clip-shape");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .musart!.snapshot()
            .project.pages[0]!.layers.find((layer) => layer.id === "clip-target")!.mask,
      ),
    )
    .toMatchObject({ layerId: "clip-shape", mode: "alpha", enabled: true });
  await expect(cue).toHaveCount(0);
  const witness = await inspectImage(page, await page.evaluate(() => window.musart!.render()), [
    { x: 0.25, y: 0.3, width: 0.2, height: 0.2 },
    { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
  ]);
  expect(witness.regions[0]!.opaque).toBe(1);
  expect(witness.regions[1]!.opaque).toBe(0);
  await page.bringToFront();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .musart!.snapshot()
            .project.pages[0]!.layers.find((layer) => layer.id === "clip-target")!.mask,
      ),
    )
    .toBeNull();
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("project artboard roots preserve the virtual tree and scroll across activation and addition", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          id: "poster",
          name: "Poster",
          width: 200,
          height: 200,
          layers: Array.from({ length: 50 }, (_, at) =>
            createLayer("rectangle", { id: `poster-${at}`, name: `Poster layer ${at}` }),
          ),
        }),
        createPage({
          id: "story",
          name: "Story",
          width: 200,
          height: 300,
          layers: [createLayer("text", { id: "story-title", name: "Story title", text: "Story" })],
        }),
      ],
    }),
  );
  const tree = page.locator(".layer-tree");
  await expect(tree.locator("[data-total-rows]")).toHaveAttribute("data-total-rows", "53");
  await tree.evaluate((node) => {
    node.dataset.retainedViewport = "yes";
    node.scrollTop = node.scrollHeight;
  });
  const story = tree.locator('[data-artboard-id="story"]');
  await expect(story).toBeVisible();
  const before = await tree.evaluate((node) => node.scrollTop);
  await story.click();
  await expect.poll(() => page.evaluate(() => window.musart!.snapshot().pageId)).toBe("story");
  await expect(tree).toHaveAttribute("data-retained-viewport", "yes");
  expect(Math.abs((await tree.evaluate((node) => node.scrollTop)) - before)).toBeLessThanOrEqual(1);
  await tree.locator('[data-layer-id="story-title"]').click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual(["story-title"]);
  await page.evaluate(
    (page) => window.musart!.execute({ type: "addPage", page }),
    createPage({ id: "square", name: "Square" }),
  );
  await expect(tree.locator("[data-total-rows]")).toHaveAttribute("data-total-rows", "55");
  await expect(tree).toHaveAttribute("data-retained-viewport", "yes");
  expect(Math.abs((await tree.evaluate((node) => node.scrollTop)) - before)).toBeLessThanOrEqual(1);
  expect(await tree.locator("[data-layer-id]").count()).toBeLessThan(25);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/layers-project-artboards.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
