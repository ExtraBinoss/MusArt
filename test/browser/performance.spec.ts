import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createEffect, type Command } from "@musart/core";
import { inspectImage, contactSheetRegions } from "./support/image-probe";
interface ReadbackProbe {
  enabled: boolean;
  gpuReads: number;
  webglReads: number;
  canvasReads: number;
  gpuHook: boolean;
  webglHook: boolean;
  canvasHook: boolean;
}
declare global {
  interface Window {
    __musartReadbacks?: ReadbackProbe;
  }
}
async function waitForRender(page: Page, previous?: number) {
  const canvas = page.locator(".canvas-artboard canvas");
  await page.waitForFunction(
    (previous) => {
      const element = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
      const data = element?.dataset;
      return Boolean(
        data &&
        data.rendererReady === "true" &&
        data.renderedRevision &&
        data.renderedRevision === data.sceneRevision &&
        data.renderCount &&
        (previous === undefined || Number(data.renderCount) > previous),
      );
    },
    previous,
    { timeout: 120000 },
  );
  return {
    ...JSON.parse((await canvas.getAttribute("data-gpu-stats")) ?? "{}"),
    renders: Number(await canvas.getAttribute("data-render-count")),
  } as Record<string, number>;
}
async function measureCommand(page: Page, command: Command) {
  return page.evaluate(async (command) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    const revision = canvas.dataset.sceneRevision;
    const started = performance.now();
    window.musart!.execute(command);
    return new Promise<number>((resolve, reject) => {
      const check = () => {
        const data = canvas.dataset;
        if (
          data.rendererReady === "true" &&
          data.sceneRevision !== revision &&
          data.sceneRevision === data.renderedRevision
        ) {
          requestAnimationFrame(() => resolve(performance.now() - started));
          return;
        }
        if (performance.now() - started > 30000) {
          reject(new Error("La nouvelle révision GPU ne s’est pas présentée."));
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, command);
}
const summarize = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    values,
  };
};
test("50 image layers and 100 effects: GPU-only composition, bounded updates, idle, export and recovery", async ({
  page,
  browserName,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe: ReadbackProbe = {
      enabled: true,
      gpuReads: 0,
      webglReads: 0,
      canvasReads: 0,
      gpuHook: false,
      webglHook: false,
      canvasHook: false,
    };
    window.__musartReadbacks = probe;
    if (typeof GPUBuffer !== "undefined") {
      const original = GPUBuffer.prototype.mapAsync;
      GPUBuffer.prototype.mapAsync = function (mode, ...args) {
        if (probe.enabled && mode & 1) probe.gpuReads++;
        return original.call(this, mode, ...args);
      };
      probe.gpuHook = true;
    }
    for (const prototype of [
      globalThis.WebGLRenderingContext?.prototype,
      globalThis.WebGL2RenderingContext?.prototype,
    ]) {
      if (!prototype) continue;
      const original = prototype.readPixels;
      prototype.readPixels = function (...args: Parameters<typeof original>) {
        if (probe.enabled) probe.webglReads++;
        return Reflect.apply(original, this, args);
      };
      probe.webglHook = true;
    }
    const original = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      ...args: Parameters<typeof original>
    ) {
      if (probe.enabled) probe.canvasReads++;
      return Reflect.apply(original, this, args);
    };
    probe.canvasHook = true;
  });
  const started = Date.now();
  await page.goto("/?benchmark=50&automation=1");
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 120000 });
  const initial = await waitForRender(page);
  const coldMs = Date.now() - started;
  const scene = await page.evaluate(() => {
    const { project, pageId } = window.musart!.snapshot();
    const page = project.pages.find((p) => p.id === pageId)!;
    return {
      images: page.layers.filter((l) => l.kind === "image").length,
      effects: page.layers.flatMap((l) => l.effects).length,
      groups: page.layers.filter((l) => l.kind === "group").length,
      masks: page.layers.filter((l) => l.mask).length,
      assetCount: Object.keys(project.assets).length,
    };
  });
  expect(scene).toMatchObject({ images: 50, effects: 100, groups: 5, masks: 10, assetCount: 51 });
  await expect(page.locator(".canvas-artboard canvas")).toHaveAttribute("data-backend", "webgpu");
  await page.screenshot({ path: "artifacts/screenshots/stress-50-images.png" });
  const previewWitness = await inspectImage(
    page,
    await page.getByTestId("artboard").screenshot(),
    contactSheetRegions,
  );
  expect(previewWitness.regions).toHaveLength(50);
  for (const region of previewWitness.regions) {
    expect(region.opaque).toBeGreaterThan(0.98);
    expect(region.backgroundDistance).toBeGreaterThan(30);
  }
  expect(
    previewWitness.regions.filter((region) => region.colors > 3).length,
  ).toBeGreaterThanOrEqual(40);
  for (const key of [
    "uploads",
    "targets",
    "cacheBytes",
    "maxBytes",
    "frames",
    "passes",
    "displayFrames",
  ])
    expect(Number.isFinite(initial[key]), `missing GPU metric: ${key}`).toBe(true);
  const moveMs: number[] = [],
    effectMs: number[] = [];
  let stats = initial;
  for (let index = 0; index < 12; index++) {
    moveMs.push(
      await measureCommand(page, {
        type: "updateLayers",
        ids: ["stress-image-1"],
        patch: { x: 230 + index + 1 },
      }),
    );
    effectMs.push(
      await measureCommand(page, {
        type: "updateLayers",
        ids: ["stress-image-1"],
        patch: {
          effects: [
            createEffect("ascii", {
              id: "stress-fx-1-1",
              amount: 0.3 + index * 0.025,
              scale: 6,
              levels: 4,
              color: false,
            }),
            createEffect("contrast", { id: "stress-fx-1-2", amount: 0.56 }),
          ],
        },
      }),
    );
    stats = await waitForRender(page, stats.renders);
  }

  expect(stats.uploads).toBe(initial.uploads);
  expect(stats.targets).toBeLessThanOrEqual(initial.targets + 2);
  expect(stats.cacheBytes).toBeLessThanOrEqual(stats.maxBytes + 1024 * 1024);
  const beforeEffect = await inspectImage(page, await page.getByTestId("artboard").screenshot(), [
    contactSheetRegions[1]!,
  ]);
  const currentFx = [
    createEffect("ascii", { id: "stress-fx-1-1", amount: 0, scale: 6, levels: 4, color: false }),
    createEffect("contrast", { id: "stress-fx-1-2", amount: 0.56 }),
  ];
  await measureCommand(page, {
    type: "updateLayers",
    ids: ["stress-image-1"],
    patch: { effects: currentFx },
  });
  const afterEffect = await inspectImage(page, await page.getByTestId("artboard").screenshot(), [
    contactSheetRegions[1]!,
  ]);
  expect(afterEffect.regions[0]!.hash).not.toBe(beforeEffect.regions[0]!.hash);
  let historyStats = await waitForRender(page);
  await page.evaluate(() => window.musart!.undo());
  historyStats = await waitForRender(page, historyStats.renders);
  expect(
    (
      await inspectImage(page, await page.getByTestId("artboard").screenshot(), [
        contactSheetRegions[1]!,
      ])
    ).regions[0]!.hash,
  ).toBe(beforeEffect.regions[0]!.hash);
  await page.evaluate(() => window.musart!.redo());
  stats = await waitForRender(page, historyStats.renders);
  expect(
    (
      await inspectImage(page, await page.getByTestId("artboard").screenshot(), [
        contactSheetRegions[1]!,
      ])
    ).regions[0]!.hash,
  ).toBe(afterEffect.regions[0]!.hash);
  const canvas = page.getByTestId("editor-canvas");
  await canvas.hover({ position: { x: 350, y: 250 } });
  const beforeView = stats;
  for (let index = 0; index < 12; index++) await page.mouse.wheel(20, -10);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 40);
  await page.keyboard.up("Control");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const afterView = await waitForRender(page);
  expect(afterView.renders).toBe(beforeView.renders);
  expect(afterView.uploads).toBe(beforeView.uploads);
  // A bounded observation window is intentional: no frame is expected while the document is idle.
  await page.waitForTimeout(1000);
  const idle = await waitForRender(page);
  expect(idle.renders).toBe(afterView.renders);
  expect(idle.displayFrames).toBe(afterView.displayFrames);
  const previewReads = await page.evaluate(() => window.__musartReadbacks!);
  expect({
    gpu: previewReads.gpuReads,
    gl: previewReads.webglReads,
    canvas: previewReads.canvasReads,
  }).toEqual({ gpu: 0, gl: 0, canvas: 0 });
  const beforeExport = Date.now();
  const exported = await page.evaluate(() => window.musart!.render({ scale: 1 }));
  const exportMs = Date.now() - beforeExport;
  const reads = await page.evaluate(() => window.__musartReadbacks!);
  expect(reads.canvasHook).toBe(true);
  expect(reads.gpuHook).toBe(true);
  expect({ gpu: reads.gpuReads, gl: reads.webglReads, canvas: reads.canvasReads }).toEqual({
    gpu: 0,
    gl: 0,
    canvas: 0,
  });
  const exportedSize = await inspectImage(page, exported);
  expect(exportedSize).toMatchObject({ width: 2400, height: 1500 });
  expect(exportedSize.colors).toBeGreaterThan(100);
  await page.evaluate(() => window.musart!.save());
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const recovered = await waitForRender(page);
  expect(
    await page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "stress-image-1")!.effects[0]!
          .amount,
    ),
  ).toBe(0);
  expect(recovered.uploads).toBe(initial.uploads);
  expect(recovered.targets).toBeLessThanOrEqual(idle.targets + 2);
  expect(recovered.cacheBytes).toBeLessThanOrEqual(recovered.maxBytes + 1024 * 1024);
  const recoveryReads = await page.evaluate(() => window.__musartReadbacks!);
  expect({
    gpu: recoveryReads.gpuReads,
    gl: recoveryReads.webglReads,
    canvas: recoveryReads.canvasReads,
  }).toEqual({ gpu: 0, gl: 0, canvas: 0 });

  const capabilities = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
            isFallbackAdapter: adapter.info.isFallbackAdapter,
          }
        : null,
      language: navigator.language,
    };
  });
  const report = {
    browserName,
    platform: process.platform,
    capabilities,
    scene,
    coldMs,
    moves: summarize(moveMs),
    effects: summarize(effectMs),
    exportMs,
    initial,
    final: idle,
    recovered,
    recoveryReads,
    previewWitness,
    previewReadbacks: previewReads,
    readbacks: reads,
    exportedSize,
    errors,
  };
  await writeFile("artifacts/performance-50.json", JSON.stringify(report, null, 2) + "\n");
  await testInfo.attach("performance-50", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
