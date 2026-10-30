import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createLayer, createPage, createProject, type Composition } from "@musart/core";
import { estimatePreviewCost } from "../../packages/render/src/compositing/preview-cost";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import {
  previewScale,
  PREVIEW_MEMORY_BYTES,
} from "../../apps/web/src/canvas/render/preview-quality";
import { installReadbackProbe } from "./support/readback-probe";
import { fitViewport, zoomViewport } from "./support/viewport";
import { fitView } from "../../apps/web/src/canvas/viewport/view";

declare global {
  interface Window {
    __previewDensityResizes?: { dpr: number; width: number }[];
  }
}

async function surface(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard-editor canvas")!,
      artboard = canvas.closest<HTMLElement>(".canvas-artboard")!,
      rect = canvas.getBoundingClientRect();
    return {
      dpr: devicePixelRatio,
      zoom: Number(artboard.dataset.zoom),
      width: canvas.width,
      height: canvas.height,
      textureLimit: Number(canvas.dataset.gpuTextureLimit),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      css: {
        imageRendering: getComputedStyle(canvas).imageRendering,
        transform: getComputedStyle(artboard).transform,
      },
      data: Object.fromEntries(Object.entries(canvas.dataset)),
      gpu: JSON.parse(canvas.dataset.gpuStats ?? "{}") as Record<string, number>,
      reads: { ...window.__musartVideoReadbacks! },
      nativeResizeEvents: [...(window.__previewDensityResizes ?? [])],
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
          ],
        ),
      ),
    };
  });
}
async function compare(inspector: Page, live: string, exported: string) {
  return inspector.evaluate(
    async ({ live, exported }) => {
      async function decode(url: string) {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          bytes: context.getImageData(0, 0, image.width, image.height).data,
        };
      }
      const a = await decode(live),
        b = await decode(exported);
      let unequal = 0,
        maximum = 0,
        darkest = 255,
        brightest = 0;
      for (let index = 0; index < a.bytes.length; index++) {
        const error = Math.abs(a.bytes[index]! - b.bytes[index]!);
        if (error) unequal++;
        maximum = Math.max(maximum, error);
        if ((index & 3) !== 3) {
          darkest = Math.min(darkest, a.bytes[index]!);
          brightest = Math.max(brightest, a.bytes[index]!);
        }
      }
      return {
        live: [a.width, a.height],
        exported: [b.width, b.height],
        unequal,
        maximum,
        colorRange: brightest - darkest,
      };
    },
    { live, exported },
  );
}

test("live preview follows zoom and changed DPR within target/device limits and matches same-density PNG", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const output = "artifacts/preview-density/final";
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    window.__previewDensityResizes = [];
    window.addEventListener("resize", () =>
      window.__previewDensityResizes!.push({ dpr: devicePixelRatio, width: innerWidth }),
    );
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(
    () => Boolean(window.musart) || Boolean(document.querySelector("vite-error-overlay")),
  );
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  let art: Composition = createTechnoArtboard(() => `density-${++sequence}`),
    projectId = "preview-density-afterhours";
  expect(art.layers).toHaveLength(150);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ id: projectId, pages: [art] }),
  );
  const inspector = await page.context().newPage();
  await page.bringToFront();
  const rows: unknown[] = [];
  async function ownerReady() {
    await page.waitForFunction((projectId) => {
      const data = document.querySelector<HTMLCanvasElement>(
        ".canvas-artboard-editor canvas",
      )?.dataset;
      return (
        Boolean(data?.renderError) ||
        (data?.projectId === projectId &&
          data.rendererReady === "true" &&
          data.sceneRevision === data.renderedRevision)
      );
    }, projectId);
    await expect(page.locator(".canvas-artboard-editor canvas")).not.toHaveAttribute(
      "data-render-error",
      /.+/,
    );
  }
  async function fitted() {
    await ownerReady();
    const viewport = await page.getByTestId("editor-canvas").boundingBox();
    if (!viewport) throw Error("Missing viewport.");
    const zoom = fitView(art, viewport).zoom;
    await expect
      .poll(async () => Number(await page.getByTestId("artboard").getAttribute("data-zoom")))
      .toBeCloseTo(zoom, 5);
    await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  }
  async function capture(label: string) {
    await ownerReady();
    await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
    const observed = await surface(page),
      scale = previewScale(art, observed.zoom * observed.dpr, observed.textureLimit);
    const dimensions = [Math.ceil(art.width * scale - 1e-9), Math.ceil(art.height * scale - 1e-9)];
    await page.waitForFunction(
      ({ dimensions, projectId }) => {
        const c = document.querySelector<HTMLCanvasElement>(".canvas-artboard-editor canvas"),
          d = c?.dataset;
        return (
          Boolean(d?.renderError) ||
          (d?.rendererReady === "true" &&
            d.projectId === projectId &&
            d.sceneRevision === d.renderedRevision &&
            c?.width === dimensions[0] &&
            c.height === dimensions[1])
        );
      },
      { dimensions, projectId },
    );
    await expect(page.locator(".canvas-artboard-editor canvas"), label).not.toHaveAttribute(
      "data-render-error",
      /.+/,
    );
    const state = await surface(page),
      estimated = estimatePreviewCost(art, scale);
    const live = await page
      .locator(".canvas-artboard-editor canvas")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
    const exported = await page.evaluate(
      (scale) => window.musart!.render({ scale, format: "png" }),
      scale,
    );
    const pixels = await compare(inspector, live, exported);
    expect(pixels.live).toEqual(dimensions);
    expect(pixels.exported).toEqual(dimensions);
    expect(pixels.unequal).toBe(0);
    expect(pixels.colorRange).toBeGreaterThan(64);
    expect(estimated.targetBytes + 16 * 1024 * 1024).toBeLessThanOrEqual(PREVIEW_MEMORY_BYTES);
    expect(estimated.bytes + 16 * 1024 * 1024).toBeLessThanOrEqual(384 * 1024 * 1024);
    expect(Math.max(state.width, state.height)).toBeLessThanOrEqual(state.textureLimit);
    expect(state.width * state.height).toBeLessThanOrEqual(64_000_000);
    expect(state.gpu.cacheBytes).toBeLessThanOrEqual(state.gpu.maxBytes);
    expect(state.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    rows.push({
      label,
      requestedDensity: state.zoom * state.dpr,
      effectiveDensity: scale,
      estimated,
      estimatedTargetBudget: PREVIEW_MEMORY_BYTES,
      ...state,
      pixelDensity: {
        x: state.width / (state.rect.width * state.dpr),
        y: state.height / (state.rect.height * state.dpr),
      },
      pixels,
    });
    await writeFile(`${output}/${label}-live.png`, Buffer.from(live.split(",")[1]!, "base64"));
    await writeFile(
      `${output}/${label}-export.png`,
      Buffer.from(exported.split(",")[1]!, "base64"),
    );
    await writeFile(
      `${output}/diagnostic.json`,
      JSON.stringify({ browser: browser.version(), rows, errors }, null, 2),
    );
    return state;
  }
  async function reset() {
    await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
    await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
    await expect
      .poll(async () => Number(await page.getByTestId("artboard").getAttribute("data-zoom")))
      .toBe(1);
  }
  const cdp = await page.context().newCDPSession(page);
  async function changeDpr(ratio: number) {
    // CDP's DPR-only override silently changes the getter without media/resize
    // notifications. A real native viewport resize supplies the browser signal;
    // the canvas zoom is unchanged throughout this emulated display transition.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1599,
      height: 1000,
      deviceScaleFactor: ratio,
      mobile: false,
    });
    await page.waitForFunction((ratio) => devicePixelRatio === ratio && innerWidth === 1599, ratio);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1000,
      deviceScaleFactor: ratio,
      mobile: false,
    });
    await page.waitForFunction((ratio) => devicePixelRatio === ratio && innerWidth === 1600, ratio);
  }
  try {
    await fitted();
    await capture("dpr1-fit");
    await reset();
    const normal = await capture("dpr1-100");
    const area = await page.getByTestId("editor-canvas").boundingBox();
    if (!area) throw Error("Missing canvas viewport.");
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await zoomViewport(page, 2);
    const enlarged = await capture("dpr1-200");
    expect(enlarged.width).toBeGreaterThan(normal.width);
    expect(enlarged.gpu.uploads).toBe(normal.gpu.uploads);
    expect(enlarged.commits[".musart-app"]).toBe(normal.commits[".musart-app"]);
    expect(enlarged.commits[".inspector"]).toBe(normal.commits[".inspector"]);
    await reset();
    await capture("before-dpr-change");
    await changeDpr(2);
    await page.waitForFunction(() => devicePixelRatio === 2);
    await capture("dpr2-without-zoom");
    await fitViewport(page);
    await fitted();
    await capture("dpr2-fit");
    await reset();
    await capture("dpr2-100");
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await zoomViewport(page, 2);
    await capture("dpr2-200");
    await changeDpr(1);
    art = createPage({
      width: 192,
      height: 128,
      background: "#ffffff",
      layers: [
        createLayer("text", {
          x: 12,
          y: 20,
          width: 170,
          height: 80,
          text: "MUSART",
          fontSize: 32,
          fontFamily: "Inter",
          fill: "#000000",
        }),
      ],
    });
    projectId = "density-dpr-control";
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({ id: projectId, pages: [art] }),
    );
    await fitted();
    const before = await capture("control-dpr1-100");
    await changeDpr(2);
    await page.waitForFunction(() => devicePixelRatio === 2);
    const after = await capture("control-dpr2-without-zoom");
    expect([after.width, after.height]).toEqual([before.width * 2, before.height * 2]);
    // The native resize signal may legitimately publish canvas layout. Preserve
    // the document/Inspector roots, and retain all canvas counters in the report.
    expect(after.commits[".musart-app"]).toBe(before.commits[".musart-app"]);
    expect(after.commits[".inspector"]).toBe(before.commits[".inspector"]);
    expect(after.gpu.uploads).toBe(before.gpu.uploads);
    expect(after.data.rendererInstances).toBe(before.data.rendererInstances);
    expect(errors).toEqual([]);
  } finally {
    if (!page.isClosed()) {
      await cdp.detach();
      await inspector.close();
    }
  }
});
