import { expect, test, type Page } from "@playwright/test";
import { createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";

async function presented(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
}

test("first cold AFTERHOURS activation keeps its decoded backdrop visible through GPU preparation", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const first = createTechnoArtboard(() => `cover-${++sequence}`),
    second = createTechnoArtboard(() => `destination-${++sequence}`);
  first.id = "cold-cover";
  second.id = "cold-destination";
  second.name = "Composition 2";
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ name: "Cold AFTERHOURS activation", pages: [first, second] }),
  );
  await presented(page);
  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  });
  const backdrop = page.locator('.canvas-artboard-backdrop[data-artboard-id="cold-destination"]');
  await expect(backdrop.locator("img")).toBeVisible();
  await backdrop.locator("img").evaluate((image) => (image as HTMLImageElement).decode());
  // canvas.css is loaded after artboards.css: these must survive the actual production cascade.
  await expect(page.getByTestId("artboard")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByTestId("artboard")).toHaveCSS("background-image", "none");
  const session = await page.context().newCDPSession(page);
  const images: string[] = [];
  session.on("Page.screencastFrame", (event) => {
    images.push(event.data);
    void session.send("Page.screencastFrameAck", { sessionId: event.sessionId });
  });
  const box = (await backdrop.boundingBox())!;
  await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  const frames = await page.evaluate(
    (id) =>
      new Promise<
        { ready: boolean; canvas: string; backdrop: string; decoded: boolean; elapsed: number }[]
      >((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
        const board = document.querySelector<HTMLElement>(
          `.canvas-artboard-backdrop[data-artboard-id="${id}"]`,
        )!;
        const image = board.querySelector("img")!;
        const start = performance.now(),
          frames: {
            ready: boolean;
            canvas: string;
            backdrop: string;
            decoded: boolean;
            elapsed: number;
          }[] = [];
        const capture = () => {
          frames.push({
            ready: canvas.dataset.rendererReady === "true",
            canvas: getComputedStyle(canvas).visibility,
            backdrop: getComputedStyle(image).visibility,
            decoded: image.isConnected && image.complete && image.naturalWidth > 0,
            elapsed: performance.now() - start,
          });
          if (canvas.dataset.rendererReady === "true") resolve(frames);
          else if (performance.now() - start > 15000) reject(new Error("Destination never drew."));
          else requestAnimationFrame(capture);
        };
        window.musart!.page(id);
        capture();
      }),
    second.id,
  );
  await presented(page);
  await page.screenshot({ path: "artifacts/screenshots/cold-afterhours-composition.png" });
  await session.send("Page.stopScreencast");
  await session.detach();
  expect(frames.some((frame) => !frame.ready && frame.canvas === "hidden")).toBe(true);
  for (const frame of frames) {
    expect(frame.decoded).toBe(true);
    expect(frame.ready ? frame.canvas : frame.backdrop).toBe("visible");
  }
  // Decode native screen captures on a separate, uninstrumented page. The empty
  // white flash used to cover the sphere's dark center during cold preparation.
  const inspection = await page.context().newPage();
  const pixels = await inspection.evaluate(
    async ({ images, x, y }) => {
      const results: number[] = [];
      for (const data of images) {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        results.push(Math.max(rgba[0]!, rgba[1]!, rgba[2]!));
      }
      return results;
    },
    { images, x: box.x + box.width * 0.49, y: box.y + box.height * 0.65 },
  );
  await inspection.close();
  expect(pixels.length).toBeGreaterThan(1);
  expect(Math.max(...pixels)).toBeLessThan(220);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/cold-artboard-flash.json",
    JSON.stringify({ frames, pixels, reads, errors }, null, 2),
  );
});
