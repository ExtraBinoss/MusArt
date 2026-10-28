import { expect, test, type Page } from "@playwright/test";
import { createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";

interface Encode {
  start: number;
  width: number;
  height: number;
}
interface ArrivalSample {
  latencyMs: number;
  verifiedAtMs: number;
  dispatchAt: number;
  generatedAt: number;
  scrollTop: number;
  target: number;
  visibleIds: string[];
  encodes: Encode[];
  submissions: number;
  before: Record<string, number>;
  after: Record<string, number>;
  frames: { at: number; ready: number; total: number }[];
}
interface LayerBurst {
  packets: { generatedAt: number; dispatchAt: number; delta: number }[];
  gaps: number[];
  longTasks: { start: number; duration: number }[];
  submissionsDuring: number[];
  encodesDuring: Encode[];
  before: Record<string, number>;
  after: Record<string, number>;
  startTop: number;
  endTop: number;
  mountedRows: number;
}
declare global {
  interface Window {
    __thumbnailArrivalEncodes?: Encode[];
    __thumbnailArrivalSubmissions?: number;
    __thumbnailArrivalSubmitTimes?: number[];
    __thumbnailArrival?: Promise<ArrivalSample>;
    __thumbnailBurst?: Promise<LayerBurst>;
    __thumbnailBurstSending?: boolean;
  }
}
async function scrollBurst(page: Page) {
  await page.evaluate(() => {
    window.__thumbnailBurstSending = true;
    window.__thumbnailBurst = new Promise<LayerBurst>((resolve, reject) => {
      const selectors = [
        ".musart-app",
        ".inspector",
        ".canvas-area",
        ".editor-canvas",
        ".editor-gpu-scene",
      ];
      const commits = () =>
        Object.fromEntries(
          selectors.map((selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
          ]),
        );
      const tree = document.querySelector<HTMLElement>(".layer-tree")!;
      const packets: LayerBurst["packets"] = [],
        gaps: { start: number; end: number }[] = [],
        longTasks: LayerBurst["longTasks"] = [];
      const before = commits(),
        startTop = tree.scrollTop;
      let frame = 0,
        previous = 0;
      const observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries())
          longTasks.push({ start: entry.startTime, duration: entry.duration });
      });
      observer.observe({ type: "longtask", buffered: false });
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Layer wheel burst did not settle."));
      }, 10000);
      function cleanup() {
        clearTimeout(timeout);
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener("wheel", wheel, true);
      }
      function poll(frameAt: number) {
        const now = performance.now();
        if (previous) gaps.push({ start: previous, end: frameAt });
        previous = frameAt;
        const first = packets[0]?.dispatchAt,
          last = packets.at(-1)?.dispatchAt;
        if (
          first !== undefined &&
          last !== undefined &&
          !window.__thumbnailBurstSending &&
          now - last > 180
        ) {
          cleanup();
          resolve({
            packets,
            before,
            after: commits(),
            startTop,
            endTop: tree.scrollTop,
            gaps: gaps
              .filter((gap) => gap.start >= first && gap.end <= last)
              .map((gap) => gap.end - gap.start),
            longTasks: longTasks.filter(
              (task) => task.start <= last && task.start + task.duration >= first,
            ),
            submissionsDuring: window.__thumbnailArrivalSubmitTimes!.filter(
              (at) => at >= first && at <= last,
            ),
            encodesDuring: window.__thumbnailArrivalEncodes!.filter(
              (value) => value.start >= first && value.start <= last,
            ),
            mountedRows: tree.querySelectorAll(".layer-row").length,
          });
        } else frame = requestAnimationFrame(poll);
      }
      function wheel(event: WheelEvent) {
        if (!tree.contains(event.target as Node)) return;
        packets.push({
          generatedAt: event.timeStamp,
          dispatchAt: performance.now(),
          delta: event.deltaY,
        });
        if (!frame) frame = requestAnimationFrame(poll);
      }
      window.addEventListener("wheel", wheel, { capture: true, passive: true });
    });
  });
  for (let index = 0; index < 24; index++) await page.mouse.wheel(0, -420);
  await page.evaluate(() => {
    window.__thumbnailBurstSending = false;
  });
  return page.evaluate(() => window.__thumbnailBurst!);
}
async function jump(page: Page, direction: "top" | "bottom") {
  await page.evaluate((direction) => {
    const tree = document.querySelector<HTMLElement>(".layer-tree")!;
    const target = direction === "top" ? 0 : tree.scrollHeight - tree.clientHeight;
    const selectors = [
      ".musart-app",
      ".inspector",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ];
    const commits = () =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
        ]),
      );
    const before = commits(),
      submissions = window.__thumbnailArrivalSubmissions!;
    const frames: ArrivalSample["frames"] = [];
    let dispatchAt = 0,
      generatedAt = 0,
      frame = 0,
      readyAt = 0,
      lastIds = "";
    window.__thumbnailArrival = new Promise<ArrivalSample>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Visible thumbnails never loaded after native wheel."));
      }, 10000);
      function cleanup() {
        clearTimeout(timeout);
        cancelAnimationFrame(frame);
        window.removeEventListener("wheel", wheel, true);
      }
      function poll() {
        const now = performance.now();
        const rect = tree.getBoundingClientRect();
        const rows = [...tree.querySelectorAll<HTMLElement>("[data-thumbnail-layer-id]")].filter(
          (element) => {
            const box = element.getBoundingClientRect();
            return (
              box.bottom > Math.max(0, rect.top) &&
              box.top < Math.min(innerHeight, rect.bottom) &&
              box.right > Math.max(0, rect.left) &&
              box.left < Math.min(innerWidth, rect.right)
            );
          },
        );
        const ids = rows.map(
          (row) =>
            `${row.dataset.thumbnailLayerId}:${row.dataset.thumbnailVariant}:${row.dataset.thumbnailEffectId ?? ""}`,
        );
        const identity = JSON.stringify(ids);
        const ready = rows.filter((row) => {
          const image = row.querySelector("img");
          return image?.complete && image.naturalWidth > 0;
        }).length;
        frames.push({ at: now - dispatchAt, ready, total: rows.length });
        if (rows.length && ready === rows.length && Math.abs(tree.scrollTop - target) < 1) {
          if (lastIds === identity && readyAt) {
            cleanup();
            resolve({
              latencyMs: readyAt - dispatchAt,
              verifiedAtMs: now - dispatchAt,
              dispatchAt,
              generatedAt,
              scrollTop: tree.scrollTop,
              target,
              visibleIds: ids,
              encodes: window.__thumbnailArrivalEncodes!.filter(
                (value) => value.start >= dispatchAt,
              ),
              submissions: window.__thumbnailArrivalSubmissions! - submissions,
              before,
              after: commits(),
              frames,
            });
            return;
          }
          readyAt = now;
        } else readyAt = 0;
        lastIds = identity;
        frame = requestAnimationFrame(poll);
      }
      function wheel(event: WheelEvent) {
        if (!tree.contains(event.target as Node)) return;
        dispatchAt = performance.now();
        generatedAt = event.timeStamp;
        window.removeEventListener("wheel", wheel, true);
        frame = requestAnimationFrame(poll);
      }
      window.addEventListener("wheel", wheel, { capture: true, passive: true });
    });
  }, direction);
  await page.mouse.wheel(0, direction === "top" ? -100000 : 100000);
  return page.evaluate(() => window.__thumbnailArrival!);
}

async function installArrivalProbe(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    window.__thumbnailArrivalEncodes = [];
    window.__thumbnailArrivalSubmissions = 0;
    window.__thumbnailArrivalSubmitTimes = [];
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (Math.max(this.width, this.height) === 96)
        window.__thumbnailArrivalEncodes!.push({
          start: performance.now(),
          width: this.width,
          height: this.height,
        });
      return original.call(this, callback, type, quality);
    };
    if (typeof GPUQueue !== "undefined") {
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (...args) {
        window.__thumbnailArrivalSubmissions!++;
        window.__thumbnailArrivalSubmitTimes!.push(performance.now());
        return Reflect.apply(submit, this, args);
      };
    }
  });
}

test("AFTERHOURS visible thumbnails arrive promptly after a full layer-list jump and cached revisits do no GPU encoding", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installArrivalProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const first = createTechnoArtboard(() => `arrival-first-${++sequence}`);
  const second = createTechnoArtboard(() => `arrival-second-${++sequence}`);
  first.id = "arrival-first";
  second.id = "arrival-second";
  second.name = "Composition 2";
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "AFTERHOURS thumbnail arrival",
      pages: [first, second],
    }),
  );
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
  });
  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  });
  await page.evaluate((id) => window.musart!.page(id), second.id);
  await page.waitForFunction((id) => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.pageId === id &&
      data.rendererReady === "true" &&
      data.sceneRevision === data.renderedRevision
    );
  }, second.id);
  // Preparation ends when actual top-row images are loaded; it is outside
  // the measured wheel boundary. The unseen bottom rows remain cold.
  await page.waitForFunction(() => {
    const tree = document.querySelector<HTMLElement>(".layer-tree")!;
    const rect = tree.getBoundingClientRect();
    const rows = [...tree.querySelectorAll<HTMLElement>("[data-thumbnail-layer-id]")].filter(
      (row) => {
        const box = row.getBoundingClientRect();
        return box.bottom > rect.top && box.top < rect.bottom;
      },
    );
    return (
      tree.scrollTop === 0 &&
      rows.length > 0 &&
      rows.every((row) => {
        const image = row.querySelector("img");
        return image?.complete && image.naturalWidth > 0;
      })
    );
  });
  await page.locator(".layer-tree").hover();
  const samples = [];
  samples.push({ name: "cold-bottom", ...(await jump(page, "bottom")) });
  samples.push({ name: "cached-top", ...(await jump(page, "top")) });
  samples.push({ name: "cached-bottom", ...(await jump(page, "bottom")) });
  const burst = await scrollBurst(page);
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info;
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .backend,
      adapter: info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
          }
        : null,
      reads: window.__musartVideoReadbacks!,
    };
  });
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/thumbnail-arrival.png" });
  await writeFile(
    "artifacts/thumbnail-arrival.json",
    JSON.stringify(
      {
        boundary:
          "Native wheel dispatch to the last actually visible loaded image (complete and naturalWidth), verified on the following frame; no artificial minimum delay.",
        layers: first.layers.length + second.layers.length,
        environment,
        samples,
        burst,
        errors,
      },
      null,
      2,
    ),
  );
  expect(samples[0]!.encodes.length).toBeGreaterThan(0);
  expect(samples[0]!.latencyMs).toBeLessThan(450);
  for (const sample of samples) {
    expect(sample.visibleIds.length).toBeGreaterThan(0);
    expect(sample.after).toEqual(sample.before);
    expect(sample.scrollTop).toBeCloseTo(sample.target, 0);
    expect(sample.frames.at(-1)!.ready).toBe(sample.visibleIds.length);
  }
  for (const sample of samples.slice(1)) {
    expect(sample.encodes).toEqual([]);
    expect(sample.submissions).toBe(0);
    expect(sample.latencyMs).toBeLessThan(150);
  }
  expect(burst.packets.length).toBeGreaterThan(1);
  expect(burst.packets.reduce((total, packet) => total + packet.delta, 0)).toBe(-24 * 420);
  expect(burst.endTop).toBeCloseTo(Math.max(0, burst.startTop - 24 * 420), 0);
  expect(burst.submissionsDuring).toEqual([]);
  expect(burst.encodesDuring).toEqual([]);
  expect(burst.after).toEqual(burst.before);
  expect(burst.longTasks).toEqual([]);
  expect(burst.mountedRows).toBeLessThanOrEqual(30);
  const sortedGaps = [...burst.gaps].sort((a, b) => a - b);
  expect(sortedGaps.length).toBeGreaterThan(1);
  expect(sortedGaps[Math.floor(sortedGaps.length * 0.95)]).toBeLessThan(28);
  expect({
    gpu: environment.reads.gpu,
    webgl: environment.reads.webgl,
    canvas: environment.reads.canvas,
  }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
  expect(errors).toEqual([]);
});

test("the first layer-list jump immediately after opening AFTERHOURS needs no save, canonical flush or thumbnail warmup", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installArrivalProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const first = createTechnoArtboard(() => `opening-first-${++sequence}`);
  const second = createTechnoArtboard(() => `opening-second-${++sequence}`);
  first.id = "opening-first";
  second.id = "opening-second";
  const bootstrap = await page.evaluate(
    (project) => {
      const startedAt = performance.now();
      window.musart!.load(project);
      return { startedAt, publishedAt: performance.now() };
    },
    createProject({ name: "AFTERHOURS first opening jump", pages: [first, second] }),
  );
  await page.waitForFunction((id) => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.pageId === id &&
      data.rendererReady === "true" &&
      data.sceneRevision === data.renderedRevision
    );
  }, first.id);
  const firstUsefulAt = await page.evaluate(() => performance.now());
  // Deliberately no save/flush, top-image wait, page activation or artificial pause.
  const box = (await page.locator(".layer-tree").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const sample = await jump(page, "bottom");
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info;
    return {
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .backend,
      adapter: info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
          }
        : null,
      reads: window.__musartVideoReadbacks!,
    };
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/thumbnail-opening-arrival.json",
    JSON.stringify(
      {
        boundary:
          "First native layer-list jump after the first useful main canvas; no explicit save, canonical flush or top-thumbnail wait. Natural bootstrap work is retained.",
        layers: first.layers.length + second.layers.length,
        bootstrap: {
          ...bootstrap,
          firstUsefulAt,
          mainCanvasMs: firstUsefulAt - bootstrap.startedAt,
          inputAfterUsefulMs: sample.dispatchAt - firstUsefulAt,
        },
        environment,
        sample,
        errors,
      },
      null,
      2,
    ),
  );
  expect(sample.visibleIds.length).toBeGreaterThan(0);
  expect(sample.encodes.length).toBeGreaterThan(0);
  expect(sample.latencyMs).toBeLessThan(450);
  expect(sample.after).toEqual(sample.before);
  expect(sample.scrollTop).toBeCloseTo(sample.target, 0);
  expect({
    gpu: environment.reads.gpu,
    webgl: environment.reads.webgl,
    canvas: environment.reads.canvas,
  }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
  expect(errors).toEqual([]);
});
