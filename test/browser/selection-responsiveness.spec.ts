import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installInteractionProbe, releaseInteractionProbe } from "./support/interaction-probe";
import { profileClock, visibleThumbnailsReady } from "./support/selection-profile";

interface Target {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Surface {
  commits: Record<string, number>;
  gpu: Record<string, number>;
  rendererInstances: string | undefined;
}
interface SelectionSample {
  route: "canvas" | "layer" | "context";
  targetId: string;
  generatedAt: number;
  dispatchAt: number;
  urgentRafAt: number;
  urgentPresentationAt: number;
  inspectorRafAt: number;
  generatedToUrgentRafMs: number;
  dispatchToUrgentRafMs: number;
  dispatchToPresentationOpportunityMs: number;
  dispatchToInspectorRafMs: number;
  before: Surface;
  urgent: Surface;
  settled: Surface;
  queueSubmissions: number[];
}
interface SelectionProbe {
  result?: SelectionSample;
  error?: string;
  cancel?: () => void;
}
declare global {
  interface Window {
    __selectionResponsiveness?: SelectionProbe;
  }
}

async function canvasPoint(page: Page, target: Target) {
  const artboard = page.getByTestId("artboard"),
    box = (await artboard.boundingBox())!;
  const size = await artboard.evaluate((node) => ({
    width: (node as HTMLElement).offsetWidth,
    height: (node as HTMLElement).offsetHeight,
  }));
  return {
    x: box.x + ((target.x + target.width / 2) * box.width) / size.width,
    y: box.y + ((target.y + target.height / 2) * box.height) / size.height,
  };
}

/** Capture clocks in this page, before native input, without cloning a document in any RAF. */
async function selectSample(page: Page, target: Target, route: SelectionSample["route"]) {
  const row = `.layer-row[data-layer-id="${target.id}"]`;
  const point =
    route === "canvas"
      ? await canvasPoint(page, target)
      : await page.locator(`${row} .layer-name`).evaluate((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x + Math.min(30, box.width / 2), y: box.y + box.height / 2 };
        });
  await page.mouse.move(point.x, point.y);
  const profiling =
    route === "context" && process.env.MUSART_SELECTION_TRACE
      ? await page.context().newCDPSession(page)
      : null;
  const traceEvents: unknown[] = [];
  let clocks: Awaited<ReturnType<typeof profileClock>> | undefined;
  if (profiling) {
    await profiling.send("Profiler.enable");
    clocks = await profileClock(profiling, page);
    profiling.on("Tracing.dataCollected", (event) => traceEvents.push(...event.value));
    await profiling.send("Tracing.start", {
      categories:
        "devtools.timeline,v8.execute,blink,disabled-by-default-devtools.timeline,disabled-by-default-blink.invalidationTracking",
      transferMode: "ReportEvents",
    });
    await profiling.send("Profiler.start");
  }
  await page.evaluate(
    ({ target, route }) => {
      window.__selectionResponsiveness?.cancel?.();
      const probe: SelectionProbe = {};
      window.__selectionResponsiveness = probe;
      const eventName =
        route === "canvas" ? "pointerdown" : route === "context" ? "contextmenu" : "click";
      const surfaces = [
        ".musart-app",
        ".inspector",
        ".layers-panel",
        ".canvas-area",
        ".editor-canvas",
        ".editor-gpu-scene",
      ];
      function capture(): Surface {
        const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
        return {
          commits: Object.fromEntries(
            surfaces.map((selector) => {
              const count = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
              if (count === undefined) throw new Error(`Missing React counter: ${selector}`);
              return [selector, Number(count)];
            }),
          ),
          gpu: JSON.parse(canvas.dataset.gpuStats!),
          rendererInstances: canvas.dataset.rendererInstances,
        };
      }
      let frame = 0,
        presentationFrame = 0,
        finished = false;
      const cleanup = () => {
        finished = true;
        clearTimeout(timeout);
        cancelAnimationFrame(frame);
        cancelAnimationFrame(presentationFrame);
        window.removeEventListener(eventName, input, true);
        probe.cancel = undefined;
      };
      const timeout = window.setTimeout(() => {
        probe.error = `Selection readiness was not observed: ${route}/${target.id}`;
        cleanup();
      }, 5000);
      probe.cancel = cleanup;
      const input = (event: Event) => {
        const generatedAt = event.timeStamp,
          dispatchAt = performance.now(),
          before = capture();
        let urgentRafAt = 0,
          urgentPresentationAt = 0,
          inspectorRafAt = 0;
        let urgent: Surface | undefined;
        const finish = () => {
          if (!urgent || !urgentPresentationAt || !inspectorRafAt) return false;
          probe.result = {
            route,
            targetId: target.id,
            generatedAt,
            dispatchAt,
            urgentRafAt,
            urgentPresentationAt,
            inspectorRafAt,
            generatedToUrgentRafMs: urgentRafAt - generatedAt,
            dispatchToUrgentRafMs: urgentRafAt - dispatchAt,
            dispatchToPresentationOpportunityMs: urgentPresentationAt - dispatchAt,
            dispatchToInspectorRafMs: inspectorRafAt - dispatchAt,
            before,
            urgent,
            settled: capture(),
            queueSubmissions: window.__interactionProbe!.submits.filter(
              (at) => at >= dispatchAt && at <= Math.max(urgentPresentationAt, inspectorRafAt),
            ),
          };
          cleanup();
          return true;
        };
        const check = () => {
          if (finished) return;
          const overlay = document.querySelector<HTMLElement>(
            `.canvas-selection[data-layer-id="${CSS.escape(target.id)}"]`,
          );
          const selectedRow = document.querySelector<HTMLElement>(
            `.layer-row[data-layer-id="${CSS.escape(target.id)}"]`,
          );
          if (
            !urgentRafAt &&
            overlay &&
            overlay.getBoundingClientRect().width > 0 &&
            selectedRow?.getAttribute("aria-selected") === "true"
          ) {
            urgentRafAt = performance.now();
            urgent = capture();
            presentationFrame = requestAnimationFrame(() => {
              urgentPresentationAt = performance.now();
              finish();
            });
          }
          const inspector = document.querySelector<HTMLElement>(".inspector");
          const x = inspector?.querySelector<HTMLInputElement>('input[aria-label="X"]');
          if (
            !inspectorRafAt &&
            inspector?.dataset.selectedLayerId === target.id &&
            x &&
            !x.matches(":disabled") &&
            !x.closest("[inert]") &&
            Math.abs(Number(x.value) - target.x) < 0.001
          )
            inspectorRafAt = performance.now();
          if (!finish()) frame = requestAnimationFrame(check);
        };
        frame = requestAnimationFrame(check);
      };
      window.addEventListener(eventName, input, { capture: true, once: true });
    },
    { target, route },
  );
  await page.mouse.click(point.x, point.y, { button: route === "context" ? "right" : "left" });
  await page.waitForFunction(() =>
    Boolean(window.__selectionResponsiveness?.result || window.__selectionResponsiveness?.error),
  );
  const probe = await page.evaluate(() => ({
    result: window.__selectionResponsiveness?.result,
    error: window.__selectionResponsiveness?.error,
  }));
  if (probe.error || !probe.result) throw new Error(probe.error ?? "Missing selection sample");
  if (profiling) {
    const { profile } = await profiling.send("Profiler.stop");
    const completed = new Promise<void>((resolve) =>
      profiling.once("Tracing.tracingComplete", () => resolve()),
    );
    await profiling.send("Tracing.end");
    await completed;
    await mkdir("artifacts/selection-responsiveness", { recursive: true });
    await writeFile(
      "artifacts/selection-responsiveness/context.cpuprofile",
      JSON.stringify(profile),
    );
    await writeFile(
      "artifacts/selection-responsiveness/context.trace.json",
      JSON.stringify({ traceEvents, clocks, sample: probe.result }),
    );
    await profiling.detach();
  }
  if (route === "context") {
    expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).not.toBe(
      "none",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  }
  return probe.result;
}

test("150 layers: native selection paints decorations independently of Inspector work", async ({
  page,
  browser,
}) => {
  await installInteractionProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const bytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
  const shape = createLayer("rectangle", {
    id: "quick-shape",
    name: "Quick shape",
    x: 40,
    y: 60,
    width: 130,
    height: 90,
    fill: "#446bba",
  });
  const text = createLayer("text", {
    id: "quick-text",
    name: "Cold text",
    text: "Selection",
    fontFamily: "Inter",
    fontSize: 24,
    x: 220,
    y: 60,
    width: 150,
    height: 90,
  });
  const image = createLayer("image", {
    id: "quick-image",
    name: "Quick photo",
    assetId: "quick-photo",
    x: 420,
    y: 60,
    width: 128,
    height: 96,
  });
  const project = createProject({
    id: "quick-selection-project",
    assets: {
      "quick-photo": {
        id: "quick-photo",
        name: "Public waterfall photograph",
        mime: "image/jpeg",
        width: 1280,
        height: 960,
        dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      },
    },
    pages: [
      createPage({
        id: "quick-selection-page",
        width: 640,
        height: 480,
        layers: [
          ...Array.from({ length: 147 }, (_, index) =>
            createLayer("rectangle", {
              id: `quick-tile-${index}`,
              x: 10 + (index % 15) * 18,
              y: 240 + Math.floor(index / 15) * 18,
              width: 12,
              height: 12,
              fill: index % 2 ? "#f09b52" : "#446bba",
            }),
          ),
          shape,
          text,
          image,
        ],
      }),
    ],
  });
  const samples: SelectionSample[] = [];
  let preparationMs = 0;
  try {
    await page.evaluate((project) => window.musart!.load(project), project);
    await page.waitForFunction((id) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        canvas?.projectId === id &&
        canvas.rendererReady === "true" &&
        canvas.sceneRevision === canvas.renderedRevision
      );
    }, project.id);
    await page.bringToFront();
    // The first actual selection is text: do not warm its font controls before this sample.
    samples.push(await selectSample(page, text, "canvas"));
    const preparationStarted = performance.now();
    await page.evaluate(() => window.musart!.flushThumbnails());
    await visibleThumbnailsReady(page);
    preparationMs = performance.now() - preparationStarted;
    for (const [target, route] of [
      [image, "canvas"],
      [shape, "canvas"],
      [text, "layer"],
      [image, "context"],
      [shape, "layer"],
      [text, "canvas"],
      [image, "canvas"],
    ] as const)
      samples.push(await selectSample(page, target, route));
    const before = await page.evaluate(() => window.musart!.snapshot());
    expect(before.selection).toEqual([image.id]);
    const x = page.locator('.inspector input[aria-label="X"]');
    await expect(x).toBeEnabled();
    await x.fill(String(image.x + 7));
    await x.press("Enter");
    const edited = await page.evaluate(() => window.musart!.snapshot());
    expect(edited.revision).toBe(before.revision + 1);
    expect(edited.project.pages[0]!.layers.find((layer) => layer.id === image.id)!.x).toBe(
      image.x + 7,
    );
    expect(edited.project.pages[0]!.layers.filter((layer) => layer.id !== image.id)).toEqual(
      before.project.pages[0]!.layers.filter((layer) => layer.id !== image.id),
    );
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    // A context click on an already-selected member preserves a real multi-selection.
    const point = await canvasPoint(page, shape);
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modifier);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up(modifier);
    expect((await page.evaluate(() => window.musart!.snapshot().selection)).sort()).toEqual(
      [image.id, shape.id].sort(),
    );
    await page
      .locator(`.layer-row[data-layer-id="${image.id}"] .layer-name`)
      .click({ button: "right" });
    expect((await page.evaluate(() => window.musart!.snapshot().selection)).sort()).toEqual(
      [image.id, shape.id].sort(),
    );
    const next = await canvasPoint(page, text);
    await page.mouse.click(next.x, next.y);
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([text.id]);
    await expect(page.getByTestId("editor-canvas")).toBeFocused();
    const reads = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    await mkdir("artifacts/selection-responsiveness", { recursive: true });
    await page.screenshot({ path: "artifacts/selection-responsiveness/selection-witness.png" });
    for (const sample of samples) {
      for (const selector of [".musart-app", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"])
        expect(
          sample.urgent.commits[selector],
          `${sample.route}/${sample.targetId}: ${selector}`,
        ).toBe(sample.before.commits[selector]);
      expect(sample.urgent.rendererInstances).toBe(sample.before.rendererInstances);
      expect(sample.urgent.gpu.submitted).toBe(sample.before.gpu.submitted);
      expect(sample.urgent.gpu.uploads).toBe(sample.before.gpu.uploads);
      expect(sample.dispatchToUrgentRafMs).toBeLessThan(100);
      expect(sample.dispatchToInspectorRafMs).toBeLessThan(500);
    }
  } finally {
    const environment = await page.evaluate(async () => {
      const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : null;
      return {
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        backend: document.querySelector(".editor-gpu-scene canvas")?.getAttribute("data-backend"),
        adapter: info
          ? {
              vendor: info.vendor,
              architecture: info.architecture,
              device: info.device,
              description: info.description,
              isFallbackAdapter: info.isFallbackAdapter,
            }
          : null,
        reads: window.__musartVideoReadbacks,
      };
    });
    await mkdir("artifacts/selection-responsiveness", { recursive: true });
    await writeFile(
      `artifacts/selection-responsiveness/${process.env.MUSART_SELECTION_COHORT ?? "candidate"}.json`,
      JSON.stringify(
        {
          fixture: { layers: 150, text: 1, images: 1, coldSelection: text.id },
          browser: browser.version(),
          environment,
          preparationMs,
          samples,
          boundary:
            "Native event generated/capture clocks to the first RAF with matching overlay and row highlight; next RAF is a presentation opportunity. Inspector readiness is recorded independently. These proxies are not physical display latency or INP.",
        },
        null,
        2,
      ),
    );
    await page.evaluate(() => {
      window.__selectionResponsiveness?.cancel?.();
      delete window.__selectionResponsiveness;
    });
    await releaseInteractionProbe(page);
  }
});
