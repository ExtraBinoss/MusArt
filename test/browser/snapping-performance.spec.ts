import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { profileClock } from "./support/selection-profile";
import { zoomViewport } from "./support/viewport";

interface Surface {
  commits: Record<string, number>;
  gpu: Record<string, number>;
  rendererInstances: string | undefined;
  contexts: number;
}
interface MoveSample {
  token: string;
  eventAt: number;
  captureAt: number;
  bubbleAt: number;
  rafAt: number;
  presentedAt: number;
  handlerMs: number;
  captureToRafMs: number;
  captureToPresentedMs: number;
  before: Surface;
  after: Surface;
  previewX: number;
  snapTargets: string[];
}
declare global {
  interface Window {
    __snapPerformance?: { token: string; result?: MoveSample; error?: string; cancel: () => void };
    __snapContexts?: { count: number };
  }
}
async function rendered(page: Page) {
  await page.waitForFunction(() => {
    const d = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')?.dataset;
    return d?.rendererReady === "true" && d.sceneRevision === d.renderedRevision;
  });
}
async function point(page: Page, x: number, y: number) {
  const board = page.getByTestId("artboard"),
    box = (await board.boundingBox())!;
  const size = await board.evaluate((element) => ({
    width: (element as HTMLElement).offsetWidth,
    height: (element as HTMLElement).offsetHeight,
  }));
  return { x: box.x + (x * box.width) / size.width, y: box.y + (y * box.height) / size.height };
}
/** Registration is acknowledged before CDP sends input; no listener/input race or synthetic dispatch. */
async function measuredMove(page: Page, token: string, x: number, y: number): Promise<MoveSample> {
  const destination = await point(page, x, y);
  await page.evaluate((token) => {
    window.__snapPerformance?.cancel();
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!;
    let captureAt = 0,
      bubbleAt = 0,
      rafAt = 0,
      presentedAt = 0,
      eventAt = 0;
    let before: Surface | undefined,
      revision = "",
      finished = false;
    const surface = (): Surface => ({
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element?.dataset.reactRenders)
              throw Error(`Missing React commit probe: ${selector}`);
            return [selector, Number(element.dataset.reactRenders)];
          },
        ),
      ),
      gpu: JSON.parse(canvas.dataset.gpuStats!) as Record<string, number>,
      rendererInstances: canvas.dataset.rendererInstances,
      contexts: window.__snapContexts!.count,
    });
    let frame = 0;
    const cleanup = () => {
      document.removeEventListener("pointermove", capture, true);
      document.removeEventListener("pointermove", bubble);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      probe.error = message;
    };
    const complete = () => {
      if (finished || !rafAt || !presentedAt || !before) return;
      finished = true;
      cleanup();
      const selected = document.querySelector<HTMLElement>(
        '.canvas-selection[data-layer-id="snap-moving"]',
      )!;
      probe.result = {
        token,
        eventAt,
        captureAt,
        bubbleAt,
        rafAt,
        presentedAt,
        handlerMs: bubbleAt - captureAt,
        captureToRafMs: rafAt - captureAt,
        captureToPresentedMs: presentedAt - captureAt,
        before,
        after: surface(),
        previewX: new DOMMatrix(selected.style.transform).e,
        snapTargets: [...document.querySelectorAll<SVGLineElement>(".canvas-snap-line")].map(
          (line) => line.dataset.snapTarget!,
        ),
      };
    };
    const presented = () => {
      if (
        !bubbleAt ||
        !revision ||
        canvas.dataset.rendererReady !== "true" ||
        canvas.dataset.renderedRevision !== revision
      )
        return;
      presentedAt ||= performance.now();
      complete();
    };
    const capture = (event: PointerEvent) => {
      if (!(event.target as Element).closest(".editor-canvas")) return;
      captureAt = performance.now();
      eventAt = event.timeStamp;
      before = surface();
      document.removeEventListener("pointermove", capture, true);
    };
    const bubble = () => {
      if (!captureAt) return;
      bubbleAt = performance.now();
      document.removeEventListener("pointermove", bubble);
      revision = canvas.dataset.sceneRevision ?? "";
      if (Number(revision) <= (before!.gpu.submitted ?? 0)) {
        fail("The move did not submit a new scene revision.");
        return;
      }
      frame = requestAnimationFrame(() => {
        rafAt = performance.now();
        presented();
        complete();
      });
      presented();
    };
    const observer = new MutationObserver(presented);
    const probe = { token, cancel: cleanup } as NonNullable<Window["__snapPerformance"]>;
    window.__snapPerformance = probe;
    observer.observe(canvas, { attributes: true });
    document.addEventListener("pointermove", capture, true);
    document.addEventListener("pointermove", bubble);
  }, token);
  await page.mouse.move(destination.x, destination.y);
  await page.waitForFunction((token) => {
    const sample = window.__snapPerformance;
    return sample?.token === token && Boolean(sample.result || sample.error);
  }, token);
  return page.evaluate(() => {
    if (window.__snapPerformance!.error) throw Error(window.__snapPerformance!.error);
    return window.__snapPerformance!.result!;
  });
}
async function executionScope() {
  const membership = await readFile("/proc/self/cgroup", "utf8").catch(() => "unavailable");
  const relative = membership.match(/^0::(.+)$/m)?.[1];
  const read = (name: string) =>
    relative
      ? readFile(`/sys/fs/cgroup${relative}/${name}`, "utf8")
          .then((value) => value.trim())
          .catch(() => "unavailable")
      : Promise.resolve("unavailable");
  const [cpuMax, memoryMax, swapMax] = await Promise.all([
    read("cpu.max"),
    read("memory.max"),
    read("memory.swap.max"),
  ]);
  return {
    membership: membership.trim(),
    cpuMax,
    memoryMax,
    swapMax,
    requestedScope:
      process.env.MUSART_PERF_SCOPE ??
      "not supplied; observed cgroup values above are authoritative",
  };
}

test("first single-layer snap among 9999 targets preserves native input latency and one undo", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [],
    samples: MoveSample[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "musart.snapping.v1",
      JSON.stringify({ version: 1, enabled: true, threshold: 6 }),
    );
    const contexts = new WeakSet<object>(),
      evidence = { count: 0 };
    window.__snapContexts = evidence;
    for (const prototype of [HTMLCanvasElement.prototype, globalThis.OffscreenCanvas?.prototype]) {
      if (!prototype) continue;
      const original = prototype.getContext;
      Object.defineProperty(prototype, "getContext", {
        value: function (
          this: HTMLCanvasElement | OffscreenCanvas,
          kind: string,
          ...args: unknown[]
        ) {
          const context = Reflect.apply(original, this, [kind, ...args]) as object | null;
          if (
            context &&
            (kind === "webgpu" || kind === "webgl2" || kind === "webgl") &&
            !contexts.has(context)
          ) {
            contexts.add(context);
            evidence.count++;
          }
          return context;
        },
      });
    }
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const moving = createLayer("rectangle", {
    id: "snap-moving",
    name: "Moving",
    x: 60,
    y: 100,
    width: 32,
    height: 32,
    fill: "#efa652",
  });
  const target = createLayer("rectangle", {
    id: "snap-reference",
    name: "Reference",
    x: 180,
    y: 100,
    width: 32,
    height: 32,
    fill: "#739bff",
  });
  const layers = [
    moving,
    target,
    ...Array.from({ length: 9998 }, (_, i) =>
      createLayer("rectangle", {
        id: `snap-target-${i}`,
        x: 350 + (i % 100) * 6,
        y: 80 + Math.floor(i / 100) * 6,
        width: 4,
        height: 4,
        fill: i % 2 ? "#808080" : "#606060",
      }),
    ),
  ];
  const project = createProject({
    name: "Single-layer snapping 10k",
    pages: [createPage({ width: 1000, height: 800, layers })],
  });
  const load = await page.evaluate((project) => {
    const startedAt = performance.now();
    window.musart!.load(project);
    return { startedAt, returnedAt: performance.now() };
  }, project);
  await rendered(page);
  await page.evaluate(async () => {
    await window.musart!.flush();
    await window.musart!.flushThumbnails();
    window.musart!.select(["snap-moving"]);
  });
  const source = await point(page, 76, 116);
  await page.mouse.move(source.x, source.y);
  await zoomViewport(page, 1);
  await rendered(page);
  await expect(page.locator('.canvas-selection[data-layer-id="snap-moving"]')).toHaveCount(1);
  const start = await point(page, 76, 116);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 1000 });
  const clock = await profileClock(session, page);
  await session.send("Profiler.start");
  let screenshot: string | undefined;
  try {
    samples.push(await measuredMove(page, "first-index-construction", 161, 116));
    for (const [index, x] of [162, 164, 166, 160].entries())
      samples.push(await measuredMove(page, `warm-query-${index}`, x, 116));
    for (const sample of samples) {
      expect(sample.previewX).toBe(148);
      expect(sample.snapTargets).toContain("snap-reference");
      expect(sample.after.commits).toEqual(sample.before.commits);
      expect(sample.after.contexts).toBe(sample.before.contexts);
      expect(sample.after.rendererInstances).toBe(sample.before.rendererInstances);
      expect(sample.after.gpu.uploads).toBe(sample.before.gpu.uploads);
    }
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.x),
    ).toBe(60);
    await mkdir("artifacts/screenshots", { recursive: true });
    screenshot = "artifacts/screenshots/snapping-performance-10000.png";
    await page.screenshot({ path: screenshot });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".canvas-snap-line")).toHaveCount(0);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    // A fresh gesture must not reuse a canceled gesture's origin or candidate exclusions.
    await page.evaluate(() => window.musart!.select(["snap-moving"]));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    samples.push(await measuredMove(page, "first-after-cancel", 161, 116));
    expect(samples.at(-1)!.previewX).toBe(148);
    await page.mouse.up();
    await rendered(page);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.x),
    ).toBe(148);
    await page.evaluate(() => window.musart!.undo());
    await rendered(page);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.x),
    ).toBe(60);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  } finally {
    await page.evaluate(() => window.__snapPerformance?.cancel()).catch(() => undefined);
    const { profile } = await session.send("Profiler.stop");
    await session.detach();
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    const environment = await page.evaluate(async () => {
      const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : undefined;
      return {
        userAgent: navigator.userAgent,
        dpr: devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        adapter: info
          ? {
              vendor: info.vendor,
              architecture: info.architecture,
              device: info.device,
              description: info.description,
            }
          : null,
      };
    });
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/snapping-performance-10000.cpuprofile", JSON.stringify(profile));
    await writeFile(
      "artifacts/snapping-performance-10000.json",
      JSON.stringify(
        {
          layers: layers.length,
          moving: 1,
          stationary: 9999,
          budgetMs: 100,
          browser: page.context().browser()!.version(),
          environment,
          scope: await executionScope(),
          clock,
          load,
          samples,
          screenshot,
          reads,
          errors,
        },
        null,
        2,
      ),
    );
  }
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  // Both raw native event windows and the matching actual GPU presentation remain visible.
  // No time is removed for index preparation, rendering, browser dispatch or frame opportunities.
  for (const sample of samples) {
    expect(sample.captureToRafMs, `${sample.token}: capture→RAF`).toBeLessThanOrEqual(100);
    expect(
      sample.captureToPresentedMs,
      `${sample.token}: capture→matching GPU draw`,
    ).toBeLessThanOrEqual(100);
  }
});
