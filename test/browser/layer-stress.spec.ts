import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { layerStressProject } from "./support/layer-stress-fixture";
import { installLayerStressProbe, layerStressScroll } from "./support/layer-stress-probe";
import { installReadbackProbe } from "./support/readback-probe";

for (const [layers, effects] of [
  [300, 100],
  [1500, 300],
  [10000, 1000],
] as const) {
  test(`${layers} AFTERHOURS layers and ${effects} varied effects retain bounded native scrolling`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    const project = layerStressProject(layers, effects),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await installLayerStressProbe(page);
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const bootstrap = await page.evaluate((project) => {
      const started = performance.now();
      window.musart!.load(project);
      return { started, published: performance.now() };
    }, project);
    await page.waitForFunction(
      () => {
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
      },
      undefined,
      { timeout: 120000 },
    );
    const firstFrame = await page.evaluate(() => performance.now());
    const warm = await layerStressScroll(page, [144, -144]);
    const forward = await layerStressScroll(
      page,
      Array.from({ length: 24 }, () => 420),
    );
    const reverse = await layerStressScroll(
      page,
      Array.from({ length: 24 }, () => -420),
    );
    const height = await page.locator(".layer-tree").evaluate((node) => node.scrollHeight);
    const bottom = await layerStressScroll(page, [height]);
    const top = await layerStressScroll(page, [-height]);
    const environment = await page.evaluate(async () => {
      const info = (await navigator.gpu?.requestAdapter())?.info;
      const state = window.musart!.snapshot();
      return {
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        adapter: info && {
          vendor: info.vendor,
          architecture: info.architecture,
          device: info.device,
          description: info.description,
        },
        backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .backend,
        canvas: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset,
        reads: window.__musartVideoReadbacks,
        gpuHook: window.__layerStressGpuHook,
        layers: state.project.pages.reduce((sum, page) => sum + page.layers.length, 0),
        effects: state.project.pages.reduce(
          (sum, page) => sum + page.layers.reduce((sum, layer) => sum + layer.effects.length, 0),
          0,
        ),
      };
    });
    const samples = { warm, forward, reverse, bottom, top };
    await mkdir("artifacts/layer-stress", { recursive: true });
    await page.screenshot({ path: `artifacts/layer-stress/${layers}.png` });
    await writeFile(
      `artifacts/layer-stress/${layers}.json`,
      JSON.stringify(
        {
          bootstrap,
          firstFrame,
          preparationMs: firstFrame - bootstrap.started,
          compositions: project.pages.length,
          environment,
          samples,
          errors,
        },
        null,
        2,
      ),
    );
    expect(environment.layers).toBe(layers);
    expect(environment.effects).toBe(effects);
    expect(environment.backend).toBe("webgpu");
    for (const sample of Object.values(samples)) {
      expect(sample.after).toEqual(sample.before);
      expect(sample.rows).toBeLessThanOrEqual(30);
      expect(sample.ready).toBe(sample.visible);
      expect(sample.visible).toBeGreaterThan(0);
    }
    for (const sample of [forward, reverse]) {
      expect(sample.tasks).toEqual([]);
      expect(sample.submissionsDuring).toEqual([]);
      expect(sample.encodesDuring).toEqual([]);
      const sorted = [...sample.gaps].sort((a, b) => a - b);
      expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(28);
    }
    expect(environment.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    expect(environment.gpuHook).toBe(true);
    expect(errors).toEqual([]);
  });
}
