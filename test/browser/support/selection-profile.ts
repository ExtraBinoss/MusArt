import type { CDPSession, Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import type { Project } from "@musart/core";
declare global {
  interface Window {
    __musartStorageReads?: { store: string; start: number; end?: number }[];
  }
}

let gestureSequence = 0;

/** Raw monotonic clocks make event.timeStamp windows attributable inside CPU profiles. */
export async function profileClock(session: CDPSession, page: Page) {
  await session.send("Performance.enable");
  const { metrics } = await session.send("Performance.getMetrics");
  const metric = (name: string) => metrics.find((entry) => entry.name === name)?.value;
  return {
    navigationStartSeconds: metric("NavigationStart"),
    timestampSeconds: metric("Timestamp"),
    browserNowMs: await page.evaluate(() => performance.now()),
  };
}

/** Physical wheel inputs, sampled during the burst before the viewport's quiet commit. */
export async function panSample(page: Page) {
  const viewport = await page.getByTestId("editor-canvas").boundingBox();
  if (!viewport) throw new Error("Viewport is unavailable.");
  await page.mouse.move(viewport.x + viewport.width * 0.45, viewport.y + viewport.height * 0.5);
  const token = String(++gestureSequence);
  const measurement = page.evaluate(
    (token) =>
      new Promise<{
        before: {
          commits: Record<string, number>;
          gpu: Record<string, number>;
          rendererInstances: string | undefined;
        };
        during: {
          commits: Record<string, number>;
          gpu: Record<string, number>;
          rendererInstances: string | undefined;
        };
        gaps: { median: number; p95: number; max: number };
        longTasks: number[];
        positions: number;
      }>((resolve, reject) => {
        const capture = () => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-testid="artboard"] canvas',
          )!;
          return {
            commits: Object.fromEntries(
              [
                ".musart-app",
                ".inspector",
                ".canvas-area",
                ".editor-canvas",
                ".editor-gpu-scene",
              ].map((selector) => [
                selector,
                Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
              ]),
            ),
            gpu: JSON.parse(canvas.dataset.gpuStats!) as Record<string, number>,
            rendererInstances: canvas.dataset.rendererInstances,
          };
        };
        const before = capture(),
          gaps: number[] = [],
          longTasks: number[] = [],
          positions = new Set<string>();
        let frame = 0,
          previous = 0,
          lastWheel = 0;
        const observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ type: "longtask", buffered: false });
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("No completed native pan burst."));
        }, 10000);
        const cleanup = () => {
          clearTimeout(timeout);
          cancelAnimationFrame(frame);
          observer.disconnect();
          window.removeEventListener("wheel", wheel, true);
        };
        function step(time: number) {
          if (previous) gaps.push(time - previous);
          previous = time;
          const board = document.querySelector<HTMLElement>('[data-testid="artboard"]')!;
          positions.add(`${board.dataset.panX}:${board.dataset.panY}`);
          if (time - lastWheel > 55) {
            const during = capture();
            cleanup();
            gaps.sort((a, b) => a - b);
            resolve({
              before,
              during,
              gaps: {
                median: gaps[Math.floor(gaps.length / 2)] ?? 0,
                p95: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
                max: gaps.at(-1) ?? 0,
              },
              longTasks,
              positions: positions.size,
            });
          } else frame = requestAnimationFrame(step);
        }
        function wheel(event: WheelEvent) {
          if (event.ctrlKey || event.metaKey) return;
          lastWheel = performance.now();
          if (!frame) frame = requestAnimationFrame(step);
        }
        window.addEventListener("wheel", wheel, true);
        document.documentElement.dataset.panProbe = token;
      }),
    token,
  );
  await page.waitForFunction((token) => document.documentElement.dataset.panProbe === token, token);
  for (let index = 0; index < 40; index++)
    await page.mouse.wheel(index < 20 ? 4 : -4, index < 20 ? 3 : -3);
  const result = await measurement;
  await page.waitForTimeout(150);
  return result;
}

/** Measures real persisted reload separately from GPU shader/source preparation. */
export async function storageReload(page: Page, expectedProject: string, expectedLayers: number) {
  const saveMs = await page.evaluate(async () => {
    const start = performance.now();
    await window.musart!.save();
    return performance.now() - start;
  });
  // Benchmark URLs intentionally rebuild fixtures. A persistence measurement must
  // reopen the saved document through the normal runtime restoration path.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.delete("benchmark");
    history.replaceState(history.state, "", url);
  });
  await page.addInitScript(() => {
    const reads: { store: string; start: number; end?: number }[] = [];
    Object.defineProperty(window, "__musartStorageReads", { value: reads, configurable: true });
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      const entry = { store: this.name, start: performance.now() } as {
        store: string;
        start: number;
        end?: number;
      };
      reads.push(entry);
      const request = get.call(this, key);
      request.addEventListener(
        "success",
        () => {
          entry.end = performance.now();
        },
        { once: true },
      );
      return request;
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 120000 });
  // A full automation snapshot clones the document. Verify after both measured
  // boundaries so the observer cannot itself delay document or useful-frame readiness.
  const documentMs = await page.evaluate(() => performance.now());
  await page.waitForFunction(
    () => {
      const data = document.querySelector<HTMLCanvasElement>(
        '[data-testid="artboard"] canvas',
      )?.dataset;
      return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
    },
    undefined,
    { timeout: 180000 },
  );
  const usefulFrameMs = await page.evaluate(() => performance.now());
  const loaded = await page.evaluate((documentMs) => {
    const started = performance.now(),
      snapshot = window.musart!.snapshot();
    return {
      id: snapshot.project.id,
      layers: snapshot.project.pages[0]!.layers.length,
      assets: Object.keys(snapshot.project.assets).length,
      reads: (window.__musartStorageReads ?? []).filter((read) => read.start <= documentMs),
      verificationMs: performance.now() - started,
    };
  }, documentMs);
  if (loaded.id !== expectedProject || loaded.layers !== expectedLayers)
    throw new Error("IndexedDB reload did not restore the actual measured project.");
  const originals = loaded.reads.filter((read) => read.store === "assets");
  if (originals.length !== loaded.assets || originals.some((read) => read.end === undefined))
    throw new Error("IndexedDB reload did not read the saved original assets.");
  return { saveMs, documentMs, usefulFrameMs, ...loaded };
}

/** Exercises the real select-all shortcut, collective frame and one committed 10k move/undo. */
async function measureLargeMove(page: Page) {
  await page.getByTestId("editor-canvas").focus();
  const token = String(++gestureSequence);
  const selected = page.evaluate(
    (token) =>
      new Promise<{ ms: number; startedAt: number; endedAt: number }>((resolve, reject) => {
        const timer = setTimeout(() => {
          cancelAnimationFrame(frame);
          window.removeEventListener("keydown", key, true);
          reject(new Error("Actual 10k select-all did not paint."));
        }, 10000);
        let frame = 0;
        function key(event: KeyboardEvent) {
          if (event.key.toLowerCase() !== "a" || (!event.ctrlKey && !event.metaKey)) return;
          const start = event.timeStamp;
          window.removeEventListener("keydown", key, true);
          function check() {
            if (
              document.querySelector('.canvas-selection-collective[data-selection-count="10000"]')
            )
              frame = requestAnimationFrame(() => {
                clearTimeout(timer);
                const endedAt = performance.now();
                resolve({ ms: endedAt - start, startedAt: start, endedAt });
              });
            else frame = requestAnimationFrame(check);
          }
          frame = requestAnimationFrame(check);
        }
        window.addEventListener("keydown", key, true);
        document.documentElement.dataset.largeSelectProbe = token;
      }),
    token,
  );
  await page.waitForFunction(
    (token) => document.documentElement.dataset.largeSelectProbe === token,
    token,
  );
  await page.keyboard.press("Control+a");
  const selection = await selected;
  const before = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!;
    return {
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
          ],
        ),
      ),
      gpu: JSON.parse(canvas.dataset.gpuStats!) as Record<string, number>,
    };
  });
  const box = await page.getByTestId("artboard").boundingBox();
  if (!box) throw new Error("Actual 10k artboard is unavailable.");
  const zoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  const start = { x: box.x + 203 * zoom, y: box.y + 203 * zoom };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const preview = page.evaluate(
    (token) =>
      new Promise<{ ms: number; startedAt: number; endedAt: number }>((resolve, reject) => {
        let frame = 0;
        const timer = setTimeout(() => {
          cancelAnimationFrame(frame);
          window.removeEventListener("pointermove", move, true);
          reject(new Error("Actual 10k movement did not preview."));
        }, 15000);
        function move(event: PointerEvent) {
          const start = event.timeStamp;
          window.removeEventListener("pointermove", move, true);
          function check() {
            const frameElement = document.querySelector<HTMLElement>(
              ".canvas-selection-collective",
            );
            if (frameElement && Number.parseFloat(frameElement.style.left) > 7)
              frame = requestAnimationFrame(() => {
                clearTimeout(timer);
                const endedAt = performance.now();
                resolve({ ms: endedAt - start, startedAt: start, endedAt });
              });
            else frame = requestAnimationFrame(check);
          }
          frame = requestAnimationFrame(check);
        }
        window.addEventListener("pointermove", move, true);
        document.documentElement.dataset.largeMoveProbe = token;
      }),
    token,
  );
  await page.waitForFunction(
    (token) => document.documentElement.dataset.largeMoveProbe === token,
    token,
  );
  await page.mouse.move(start.x + 12 * zoom, start.y + 9 * zoom);
  const movement = await preview;
  const held = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!;
    return {
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
          ],
        ),
      ),
      gpu: JSON.parse(canvas.dataset.gpuStats!) as Record<string, number>,
    };
  });
  const commit = page.evaluate(
    (token) =>
      new Promise<{ ms: number; startedAt: number; endedAt: number }>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-testid="artboard"] canvas',
        )!;
        const previousRevision = canvas.dataset.sceneRevision;
        let frame = 0;
        const cleanup = () => {
          clearTimeout(timer);
          cancelAnimationFrame(frame);
          window.removeEventListener("pointerup", up, true);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Actual 10k movement did not commit a canonical GPU frame."));
        }, 15000);
        function up(event: PointerEvent) {
          const startedAt = event.timeStamp;
          window.removeEventListener("pointerup", up, true);
          function check() {
            if (
              canvas.dataset.sceneRevision !== previousRevision &&
              canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
            )
              frame = requestAnimationFrame(() => {
                const endedAt = performance.now();
                cleanup();
                resolve({ ms: endedAt - startedAt, startedAt, endedAt });
              });
            else frame = requestAnimationFrame(check);
          }
          frame = requestAnimationFrame(check);
        }
        window.addEventListener("pointerup", up, true);
        document.documentElement.dataset.largeCommitProbe = token;
      }),
    token,
  );
  await page.waitForFunction(
    (token) => document.documentElement.dataset.largeCommitProbe === token,
    token,
  );
  const commitStart = performance.now();
  await page.mouse.up();
  const commitMs = performance.now() - commitStart;
  const release = await commit;
  const moved = await page.evaluate(() => {
    const snapshot = window.musart!.snapshot();
    return {
      count: snapshot.selection.length,
      canUndo: snapshot.canUndo,
      first: snapshot.project.pages[0]!.layers[0]!,
      last: snapshot.project.pages[0]!.layers[9999]!,
    };
  });
  await page.keyboard.press("Control+z");
  const undone = await page.evaluate(() => {
    const snapshot = window.musart!.snapshot();
    return {
      canUndo: snapshot.canUndo,
      first: snapshot.project.pages[0]!.layers[0]!,
      last: snapshot.project.pages[0]!.layers[9999]!,
    };
  });
  return {
    selectAllMs: selection.ms,
    previewMs: movement.ms,
    commitMs,
    commitUiMs: release.ms,
    windows: { selection, movement, release },
    before,
    held,
    moved,
    undone,
  };
}

/** Separate engine/automation publication from later source compilation and browser IPC. */
export function loadMeasuredProject(page: Page, project: Project) {
  return page.evaluate((project) => {
    const started = performance.now();
    window.musart!.load(project);
    return { started, callMs: performance.now() - started };
  }, project);
}
/** Canonical flush plus decoded visible rows proves that the baseline has no visible preview work left. */
export async function visibleThumbnailsReady(page: Page) {
  await page.waitForFunction(
    () => {
      const tree = document.querySelector<HTMLElement>(".layer-tree");
      if (!tree) return true;
      const area = tree.getBoundingClientRect();
      const visible = [...tree.querySelectorAll<HTMLElement>(".layer-thumbnail")].filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.height > 0 &&
          rect.width > 0 &&
          rect.bottom >= area.top &&
          rect.top <= area.bottom &&
          rect.right >= area.left &&
          rect.left <= area.right
        );
      });
      return visible.every((node) => {
        const image = node.querySelector("img");
        return node.dataset.previewReady === "true" && image?.complete && image.naturalWidth > 0;
      });
    },
    undefined,
    { timeout: 60000 },
  );
}

/** Keep mutation/undo attribution separate from point-selection profiles. */
export async function largeMoveSample(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 1000 });
  const clock = await profileClock(session, page);
  await session.send("Profiler.start");
  try {
    return { ...(await measureLargeMove(page)), clock };
  } finally {
    try {
      const { profile } = await session.send("Profiler.stop");
      await mkdir("artifacts", { recursive: true });
      await writeFile(
        "artifacts/selection-elements-10000-move.cpuprofile",
        JSON.stringify(profile),
      );
    } finally {
      await session.detach();
    }
  }
}
