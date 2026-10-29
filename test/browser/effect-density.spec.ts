import { expect, test, type Page } from "@playwright/test";
import { EFFECT_CATALOG } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import {
  DENSITY_CASES,
  compareDensity,
  densityProject,
  densityEnvironment,
} from "./support/effect-density";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";
import { WHEEL_PAN_SPEED } from "../../apps/web/src/canvas/viewport/view";

async function ready(page: Page, projectId: string, scale?: number) {
  await page.waitForFunction(
    ({ projectId, scale }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas"),
        data = canvas?.dataset;
      return (
        data?.pageId === "density-page" &&
        data.projectId === projectId &&
        data.rendererReady === "true" &&
        data.sceneRevision === data.renderedRevision &&
        (scale === undefined || Number(data.renderWidth) === 112 * scale)
      );
    },
    { projectId, scale },
  );
}
async function png(page: Page, scale: number, forceWebGL: boolean) {
  return page.evaluate((options) => window.musart!.render(options), {
    scale,
    forceWebGL,
    format: "png" as const,
  });
}
async function captureAlignedCanvas(page: Page, zoom: number) {
  const canvas = page.locator(".editor-gpu-scene canvas");
  const initial = (await canvas.boundingBox())!;
  const dx = initial.x - Math.round(initial.x),
    dy = initial.y - Math.round(initial.y);
  if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) {
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
    await page.mouse.wheel(dx / WHEEL_PAN_SPEED, dy / WHEEL_PAN_SPEED);
    await expect
      .poll(async () => {
        const current = (await canvas.boundingBox())!;
        return Math.max(
          Math.abs(current.x - Math.round(initial.x)),
          Math.abs(current.y - Math.round(initial.y)),
        );
      })
      .toBeLessThan(0.001);
    await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  }
  const bounds = (await canvas.boundingBox())!;
  expect(bounds.x).toBeCloseTo(Math.round(bounds.x), 3);
  expect(bounds.y).toBeCloseTo(Math.round(bounds.y), 3);
  expect(bounds.width).toBeCloseTo(112 * zoom, 3);
  expect(bounds.height).toBeCloseTo(80 * zoom, 3);
  // Native page capture with the verified integer canvas extent. Locator capture
  // outward-rounds floating-point CSS bounds and can add a spurious border pixel.
  const clip = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: 112 * zoom,
    height: 80 * zoom,
  };
  return { image: await page.screenshot({ clip, scale: "css" }), bounds, clip };
}
for (const forceWebGL of [false, true])
  test(`every effect keeps its document coordinates in 1x/2x/4x PNG exports (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspection = await page.context().newPage();
    await page.bringToFront();
    const rows: {
      name: string;
      density: number;
      metrics: Awaited<ReturnType<typeof compareDensity>>;
    }[] = [];
    const changes: { name: string; rgbMean: number }[] = [];
    const geometry: {
      name: string;
      density: number;
      metrics: Awaited<ReturnType<typeof compareDensity>>;
    }[] = [];
    const failures: string[] = [];
    try {
      expect([...new Set(DENSITY_CASES.map((fixture) => fixture.effect.type))].sort()).toEqual(
        Object.keys(EFFECT_CATALOG).sort(),
      );
      for (const fixture of DENSITY_CASES) {
        const disabled = { ...fixture, effect: { ...fixture.effect, enabled: false } };
        await page.evaluate((project) => window.musart!.load(project), densityProject(disabled));
        const untouched = await png(page, 1, forceWebGL);
        const geometryAlpha = new Map<number, number>();
        const geometryCandidates = new Map<number, string>();
        if (fixture.fractional)
          for (const density of [2, 4]) {
            const candidate = await png(page, density, forceWebGL);
            const metrics = await compareDensity(inspection, untouched, candidate);
            geometry.push({ name: fixture.name, density, metrics });
            geometryAlpha.set(density, metrics.alphaMean);
            geometryCandidates.set(density, candidate);
          }
        const neutralCandidates = new Map<number, string>();
        let neutralReference: string | undefined;
        if (fixture.fractional) {
          const neutral = { ...fixture, effect: { ...fixture.effect, enabled: true, amount: 0 } };
          await page.evaluate((project) => window.musart!.load(project), densityProject(neutral));
          neutralReference = await png(page, 1, forceWebGL);
          for (const density of [2, 4])
            neutralCandidates.set(density, await png(page, density, forceWebGL));
        }
        await page.evaluate((project) => window.musart!.load(project), densityProject(fixture));
        const reference = await png(page, 1, forceWebGL);
        const changed = await compareDensity(inspection, untouched, reference);
        changes.push({ name: fixture.name, rgbMean: changed.rgbMean });
        if (changed.rgbMean < 0.25)
          failures.push(
            `${fixture.name}: fixture did not reveal the enabled effect (${changed.rgbMean.toFixed(3)})`,
          );
        for (const density of [2, 4]) {
          const candidate = await png(page, density, forceWebGL);
          const metrics = await compareDensity(
            inspection,
            reference,
            candidate,
            fixture.fractional
              ? {
                  reference: neutralReference!,
                  candidate: neutralCandidates.get(density)!,
                }
              : undefined,
            fixture.fractional
              ? { reference: untouched, candidate: geometryCandidates.get(density)! }
              : undefined,
          );
          rows.push({ name: fixture.name, density, metrics });
          if (metrics.candidate[0] !== 112 * density || metrics.candidate[1] !== 80 * density)
            failures.push(`${fixture.name}@${density}: wrong PNG dimensions`);
          const colorError = fixture.fractional ? metrics.commonCoverageRgbMean : metrics.rgbMean;
          if (colorError > fixture.tolerance)
            failures.push(
              `${fixture.name}@${density}: ${fixture.fractional ? "common-coverage " : ""}RGB mean ${colorError.toFixed(3)} > ${fixture.tolerance}`,
            );
          if (fixture.fractional) {
            if (
              metrics.pixels !== 6144 ||
              metrics.rgbMean > fixture.tolerance + metrics.coverageRgbContribution + 1e-9
            )
              failures.push(
                `${fixture.name}@${density}: raw RGB exceeds color bound + directly measured coverage contribution`,
              );
            const control = metrics.coverageControl;
            if (
              !control ||
              control.referenceAlphaMax !== 0 ||
              control.candidateAlphaMax !== 0 ||
              control.coverageDeltaMax !== 0
            )
              failures.push(
                `${fixture.name}@${density}: effect changed an enabled-neutral per-pixel alpha/coverage control map`,
              );
          }
          const baselineAlpha = geometryAlpha.get(density);
          if (
            baselineAlpha === undefined
              ? metrics.alphaMean > 2
              : Math.abs(metrics.alphaMean - baselineAlpha) > 0.01
          )
            failures.push(
              `${fixture.name}@${density}: alpha mean ${metrics.alphaMean.toFixed(3)} differs from ${baselineAlpha === undefined ? "the 2-level AA bound" : `effect-disabled geometry ${baselineAlpha.toFixed(3)}`}`,
            );
          if (fixture.mask && !(metrics.minimumAlpha === 0 && metrics.maximumAlpha > 200))
            failures.push(`${fixture.name}@${density}: missing genuine mask coverage`);
        }
      }
      const info = await densityEnvironment(page);
      await mkdir("artifacts", { recursive: true });
      await writeFile(
        `artifacts/effect-density-${forceWebGL ? "webgl" : "webgpu"}.json`,
        JSON.stringify(
          {
            boundary:
              "Native PNGs from the retained compositor, normalized only in an inspection page. All 6144 crop pixels retain raw premultiplied RGB/alpha metrics. Fractional geometry separates direct common-coverage color K from direct coverage term G; color keeps bound4, raw keeps bound4+G. Enabled-neutral amount0 keeps the identical reference/mip transport and its per-pixel alpha maps/signed coverage-difference maps must be exact. Disabled-geometry maps remain diagnostic and their original mean0.01 gate is retained. No pixels or borders are excluded.",
            environment: info,
            changes,
            geometry,
            rows,
            failures,
            errors,
          },
          null,
          2,
        ),
      );
      expect(failures).toEqual([]);
      expect({ gpu: info.reads.gpu, webgl: info.reads.webgl, canvas: info.reads.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      expect(errors).toEqual([]);
    } finally {
      await inspection.close();
    }
  });

test("live 100%/200%/400% GPU canvas pixels exactly match same-density exports; CSS screenshots are diagnosed separately", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const inspection = await page.context().newPage();
  await page.bringToFront();
  const rows: {
    name: string;
    zoom: number;
    bounds: Awaited<ReturnType<typeof captureAlignedCanvas>>["bounds"];
    clip: Awaited<ReturnType<typeof captureAlignedCanvas>>["clip"];
    metrics: Awaited<ReturnType<typeof compareDensity>>;
    native: Awaited<ReturnType<typeof compareDensity>>;
  }[] = [];
  const failures: string[] = [];
  try {
    // Every catalogue effect plus spatial Gradient treatment/minimum-size/noise cases.
    const fixtures = DENSITY_CASES.filter(
      (fixture) =>
        fixture.name === fixture.effect.type ||
        fixture.effect.type === "gradient" ||
        fixture.fractional,
    );
    for (const fixture of fixtures) {
      const project = densityProject(fixture, true);
      await page.evaluate((project) => window.musart!.load(project), project);
      await ready(page, project.id);
      await page.locator(".editor-gpu-scene").evaluate(async (node) => {
        await Promise.all(
          node
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      const reference = await png(page, 1, false);
      for (const zoom of [1, 2, 4]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, project.id, zoom);
        const screenshot = await captureAlignedCanvas(page, zoom);
        const nativeCanvas = await page
          .locator(".editor-gpu-scene canvas")
          .evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
        const sameDensityExport = zoom === 1 ? reference : await png(page, zoom, false);
        const native = await compareDensity(inspection, sameDensityExport, nativeCanvas);
        expect(native.reference).toEqual([112 * zoom, 80 * zoom]);
        expect(native.candidate).toEqual([112 * zoom, 80 * zoom]);
        if (native.differentPixels !== 0 || native.maximumByteDifference !== 0)
          failures.push(
            `${fixture.name}@zoom${zoom}: GPU canvas differs from same-density PNG in ${native.differentPixels} pixels, maximum RGBA byte difference ${native.maximumByteDifference}`,
          );
        const metrics = await compareDensity(
          inspection,
          reference,
          `data:image/png;base64,${screenshot.image.toString("base64")}`,
        );
        expect(metrics.candidate).toEqual([112 * zoom, 80 * zoom]);
        rows.push({
          name: fixture.name,
          zoom,
          bounds: screenshot.bounds,
          clip: screenshot.clip,
          metrics,
          native,
        });
      }
    }
    const info = await densityEnvironment(page);
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/effect-density-live-zoom.json",
      JSON.stringify(
        {
          boundary:
            "Real native Ctrl+wheel zoom, exact durable project and raster-density renderer acknowledgment. Browser-native PNG encoding of the actual GPU canvas must match the same-density export in every decoded RGBA byte. Native wheel pan aligns CSS canvas bounds; exact-size screen clips and their normalized differences remain separate browser/CSS presentation diagnostics, not an assertion of byte identity with encoded GPU textures. No production pixel reads.",
          environment: info,
          rows,
          failures,
          errors,
        },
        null,
        2,
      ),
    );
    expect(failures).toEqual([]);
    expect({ gpu: info.reads.gpu, webgl: info.reads.webgl, canvas: info.reads.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
  } finally {
    await inspection.close();
  }
});
