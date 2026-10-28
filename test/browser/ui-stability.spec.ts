import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { mkdir, writeFile } from "node:fs/promises";

declare global {
  interface Window {
    __musartPreviewEncodes?: { width: number; height: number }[];
  }
}
async function ready(page: Page) {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
}
const layers = () =>
  Array.from({ length: 6 }, (_, at) =>
    createLayer("rectangle", {
      id: `preview-${at}`,
      name: `Preview ${at}`,
      x: 30 + at * 20,
      y: 30 + at * 20,
      width: 120,
      height: 120,
      fill: "#3366ff",
    }),
  );
async function thumbnails(page: Page) {
  return page.locator(".layer-thumbnail").evaluateAll((nodes) => {
    const result: Record<string, { source?: string; requests: number }> = {};
    for (const node of nodes) {
      const id = (node as HTMLElement).dataset.thumbnailLayerId;
      if (id)
        result[id] = {
          source: node.querySelector("img")?.src,
          requests: Number((node as HTMLElement).dataset.previewRequests ?? 0),
        };
    }
    return result;
  });
}
test("editing one layer retains unrelated GPU thumbnails and enqueues only its real preview", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__musartPreviewEncodes = [];
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      window.__musartPreviewEncodes!.push({ width: this.width, height: this.height });
      return encode.call(this, callback, type, quality);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width: 400, height: 400, layers: layers() })] }),
  );
  await expect(page.locator(".layer-thumbnail img")).toHaveCount(6);
  const before = await thumbnails(page),
    jobs = await page.evaluate(
      () =>
        window.__musartPreviewEncodes!.filter((job) => job.width === 96 && job.height === 96)
          .length,
    );
  await page.evaluate(() =>
    window.musart!.execute({
      type: "updateLayers",
      ids: ["preview-2"],
      patch: { fill: "#ff3366" },
    }),
  );
  await expect
    .poll(async () => (await thumbnails(page))["preview-2"]?.source)
    .not.toBe(before["preview-2"]?.source);
  await expect(page.locator(".layer-thumbnail img")).toHaveCount(6);
  const after = await thumbnails(page);
  for (const [id, value] of Object.entries(before)) {
    expect(after[id]?.requests).toBe(value.requests + (id === "preview-2" ? 1 : 0));
    if (id !== "preview-2") expect(after[id]?.source).toBe(value.source);
  }
  expect(
    await page.evaluate(
      () =>
        window.__musartPreviewEncodes!.filter((job) => job.width === 96 && job.height === 96)
          .length,
    ),
  ).toBe(jobs + 1);
  await page.evaluate(() =>
    window.musart!.execute({ type: "renameProject", name: "Metadata only" }),
  );
  await page.waitForTimeout(300);
  expect(await thumbnails(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test("repeated native color gestures stay bounded across solid and gradient targets", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Maximum update depth|unmounted component/i.test(message.text())
    )
      errors.push(message.text());
  });
  await ready(page);
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["solid"]);
    },
    createProject({
      pages: [
        createPage({
          width: 400,
          height: 400,
          layers: [
            createLayer("rectangle", { id: "solid", fill: "#3366ff80", width: 300, height: 300 }),
            createLayer("text", {
              id: "gradient",
              text: "Gradient",
              fillGradient: {
                kind: "linear",
                angle: 0,
                stops: [
                  { offset: 0, color: "#3366ff" },
                  { offset: 1, color: "#cc77aa" },
                ],
              },
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  for (const target of ["solid", "gradient"]) {
    await page.evaluate((id) => window.musart!.select([id]), target);
    for (const selector of [".color-hue", ".color-alpha", ".color-sv-pad"]) {
      for (let repeat = 0; repeat < 3; repeat++) {
        const box = (await page.locator(selector).boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 12 });
        await page.mouse.up();
      }
    }
    const hex = page.getByRole("textbox", { name: "Couleur hexadécimale", exact: true });
    for (const value of ["#3366ff80", "#cc8844", "#8877aa80"]) {
      await hex.fill(value);
      await hex.press("Enter");
    }
  }
  const hue = (await page.locator(".color-hue").boundingBox())!;
  await page.mouse.move(hue.x + hue.width / 2, hue.y + 20);
  await page.mouse.down();
  await page.mouse.move(hue.x + hue.width / 2, hue.y + 60);
  await page.evaluate(() => window.musart!.select(["solid"]));
  await page.mouse.move(hue.x + hue.width / 2, hue.y + 90);
  await page.mouse.up();
  expect(errors).toEqual([]);
  await expect(page.locator(".inspector")).toHaveAttribute("data-selected-layer-id", "solid");
});

test("AFTERHOURS layer scrolling updates only its virtual window without editor commits", async ({
  page,
}) => {
  await ready(page);
  const board = createTechnoArtboard();
  await page.evaluate((project) => window.musart!.load(project), createProject({ pages: [board] }));
  await page.waitForFunction((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
    return (
      canvas?.dataset.pageId === id &&
      canvas.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  }, board.id);
  const tree = page.getByRole("tree", { name: "Calques" });
  await tree.hover();
  const capture = (): Promise<Record<string, number>> =>
    page
      .locator(".musart-app,.inspector,.canvas-area,.editor-canvas,.layers-panel")
      .evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((node) => [node.className, Number((node as HTMLElement).dataset.reactRenders)]),
        ),
      );
  const before = await capture();
  const samples = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const gaps: number[] = [];
        let previous = performance.now();
        const end = previous + 800;
        function frame(now: number) {
          gaps.push(now - previous);
          previous = now;
          if (now < end) requestAnimationFrame(frame);
          else resolve(gaps);
        }
        requestAnimationFrame(frame);
      }),
  );
  for (let at = 0; at < 12; at++) await page.mouse.wheel(0, 35);
  const gaps = await samples,
    after = await capture();
  expect(await tree.evaluate((node) => node.scrollTop)).toBeGreaterThan(300);
  expect(await tree.locator("[data-layer-id]").count()).toBeLessThan(35);
  for (const [name, count] of Object.entries(before)) {
    if (name === "layers-panel") expect(after[name]! - count).toBeLessThanOrEqual(4);
    else expect(after[name]).toBe(count);
  }
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/ui-layer-scroll.json",
    JSON.stringify({ before, after, gaps }, null, 2),
  );
});
