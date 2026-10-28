import { expect, test } from "@playwright/test";
import { createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";
import { visibleThumbnailsReady } from "./support/selection-profile";
import { measurePanPresentation } from "./support/pan-presentation";
import { withNativeTimeline } from "./support/native-timeline";
import { mkdir, writeFile } from "node:fs/promises";

const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? 0;

test("AFTERHOURS native120Hz wheel and hand pan present smoothly with visible rulers, guides and selection", async ({
  page,
}) => {
  test.setTimeout(180000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let id = 0;
  const artboard = createTechnoArtboard(() => `pan-${++id}`);
  const text = artboard.layers.find((layer) => layer.kind === "text" && !layer.maskSource)!;
  await page.evaluate(
    ({ project, selected }) => {
      window.musart!.load(project);
      window.musart!.select([selected]);
    },
    { project: createProject({ pages: [artboard] }), selected: text.id },
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.evaluate(() => window.musart!.flushThumbnails());
  await visibleThumbnailsReady(page);
  await page.waitForTimeout(500);
  const samples = [];
  for (const mode of ["wheel", "hand"] as const) {
    const sample =
      process.env.MUSART_PAN_TRACE && mode === "wheel"
        ? await withNativeTimeline(page, "pan-wheel", () => measurePanPresentation(page, mode))
        : await measurePanPresentation(page, mode);
    samples.push({
      mode,
      ...sample,
      summary: {
        frameP95: percentile(sample.gaps, 0.95),
        frameMax: Math.max(...sample.gaps),
        inputToRafP95: percentile(
          sample.frames.map((frame) => frame.inputToRafMs),
          0.95,
        ),
        dispatchDelayP95: percentile(
          sample.frames.map((frame) => frame.dispatchDelayMs),
          0.95,
        ),
        handlerToRafP95: percentile(
          sample.frames.map((frame) => frame.handlerToRafMs),
          0.95,
        ),
        inputToPresentedP95: percentile(
          sample.frames.map((frame) => frame.inputToPresentedMs!),
          0.95,
        ),
      },
    });
  }
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  const environment = await page.evaluate(async () => {
    const adapter = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : undefined;
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
      adapter: adapter
        ? {
            vendor: adapter.vendor,
            architecture: adapter.architecture,
            device: adapter.device,
            description: adapter.description,
          }
        : null,
    };
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/pan-presentation.json",
    JSON.stringify(
      { browser: page.context().browser()!.version(), environment, samples, reads },
      null,
      2,
    ),
  );
  await page.screenshot({ path: "artifacts/screenshots/pan-afterhours.png" });
  for (const sample of samples) {
    expect(sample.inputs).toBeGreaterThan(20);
    expect(sample.frames.length).toBeGreaterThan(10);
    expect(sample.marks.rulers).toBeGreaterThan(20);
    expect(sample.marks.guides).toBeGreaterThan(0);
    expect(sample.marks.selections).toBeGreaterThan(0);
    expect(sample.after.commits).toEqual(sample.before.commits);
    expect(sample.after.gpu.submitted).toBe(sample.before.gpu.submitted);
    expect(sample.after.gpu.uploads).toBe(sample.before.gpu.uploads);
    expect(Math.max(...sample.frames.map((frame) => frame.poseError))).toBeLessThan(0.01);
    expect(sample.summary.frameP95).toBeLessThanOrEqual(25);
    expect(sample.summary.frameMax).toBeLessThanOrEqual(50);
    expect(sample.summary.inputToRafP95).toBeLessThanOrEqual(25);
    expect(sample.summary.inputToPresentedP95).toBeLessThanOrEqual(50);
    expect(sample.longTasks).toEqual([]);
  }
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
