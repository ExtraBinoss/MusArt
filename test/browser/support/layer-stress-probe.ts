import type { Page } from "@playwright/test";

export interface LayerStressSample {
  packets: { generated: number; dispatch: number; delta: number }[];
  gaps: number[];
  tasks: { start: number; duration: number }[];
  before: Record<string, number>;
  after: Record<string, number>;
  rows: number;
  startTop: number;
  endTop: number;
  arrivalMs: number;
  ready: number;
  visible: number;
  submissionsDuring: number[];
  encodesDuring: number[];
}
declare global {
  interface Window {
    __layerStressSample?: Promise<LayerStressSample>;
    __layerStressSending?: boolean;
    __layerStressGpuTimes?: number[];
    __layerStressEncodeTimes?: number[];
    __layerStressGpuHook?: boolean;
  }
}

export async function installLayerStressProbe(page: Page) {
  await page.addInitScript(() => {
    window.__layerStressGpuTimes = [];
    window.__layerStressEncodeTimes = [];
    const Constructor = (globalThis as typeof globalThis & { GPUQueue?: { prototype: GPUQueue } })
      .GPUQueue;
    window.__layerStressGpuHook = Boolean(Constructor);
    if (Constructor) {
      const submit = Constructor.prototype.submit;
      Constructor.prototype.submit = function (commands) {
        window.__layerStressGpuTimes!.push(performance.now());
        return submit.call(this, commands);
      };
    }
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      window.__layerStressEncodeTimes!.push(performance.now());
      return toBlob.call(this, callback, type, quality);
    };
  });
}

/** Native input clocks and actual image readiness; never clone the document inside a measured frame. */
export async function layerStressScroll(
  page: Page,
  deltas: readonly number[],
): Promise<LayerStressSample> {
  await page.locator(".layer-tree").hover();
  await page.evaluate(() => {
    window.__layerStressSending = true;
    window.__layerStressSample = new Promise((resolve, reject) => {
      const tree = document.querySelector<HTMLElement>(".layer-tree")!;
      const selectors = [
        ".musart-app",
        ".inspector",
        ".canvas-area",
        ".editor-canvas",
        ".editor-gpu-scene",
        ".layers-panel",
      ];
      const commits = () =>
        Object.fromEntries(
          selectors.map((selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
          ]),
        );
      const packets: LayerStressSample["packets"] = [],
        gaps: { start: number; end: number }[] = [],
        tasks: LayerStressSample["tasks"] = [];
      const before = commits(),
        startTop = tree.scrollTop;
      let frame = 0,
        previous = 0;
      const observer = new PerformanceObserver((entries) =>
        tasks.push(
          ...entries
            .getEntries()
            .map((entry) => ({ start: entry.startTime, duration: entry.duration })),
        ),
      );
      observer.observe({ type: "longtask", buffered: false });
      const cleanup = () => {
        clearTimeout(timeout);
        cancelAnimationFrame(frame);
        observer.disconnect();
        tree.removeEventListener("wheel", wheel);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Stress scroll thumbnails did not settle within 15 seconds."));
      }, 15000);
      const poll = (at: number) => {
        if (previous) gaps.push({ start: previous, end: at });
        previous = at;
        const first = packets[0]?.dispatch,
          last = packets.at(-1)?.dispatch;
        if (
          first !== undefined &&
          last !== undefined &&
          !window.__layerStressSending &&
          performance.now() - last > 150
        ) {
          const bounds = tree.getBoundingClientRect();
          const visible = [
            ...tree.querySelectorAll<HTMLElement>("[data-thumbnail-layer-id]"),
          ].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.top < bounds.bottom && rect.bottom > bounds.top;
          });
          const ready = visible.filter((node) => {
            const image = node.querySelector("img");
            return image?.complete && image.naturalWidth > 0;
          }).length;
          if (ready === visible.length && visible.length) {
            const arrivalMs = performance.now() - last;
            cleanup();
            resolve({
              packets,
              gaps: gaps
                .filter((gap) => gap.start >= first && gap.end <= last)
                .map((gap) => gap.end - gap.start),
              tasks: tasks.filter(
                (task) => task.start < last && task.start + task.duration > first,
              ),
              before,
              after: commits(),
              rows: tree.querySelectorAll("[data-layer-tree-key]").length,
              startTop,
              endTop: tree.scrollTop,
              arrivalMs,
              ready,
              visible: visible.length,
              submissionsDuring: window.__layerStressGpuTimes!.filter(
                (at) => at >= first && at <= last,
              ),
              encodesDuring: window.__layerStressEncodeTimes!.filter(
                (at) => at >= first && at <= last,
              ),
            });
            return;
          }
        }
        frame = requestAnimationFrame(poll);
      };
      function wheel(event: WheelEvent) {
        packets.push({
          generated: event.timeStamp,
          dispatch: performance.now(),
          delta: event.deltaY,
        });
        if (!frame) frame = requestAnimationFrame(poll);
      }
      tree.addEventListener("wheel", wheel, { passive: true });
    });
  });
  for (const delta of deltas) await page.mouse.wheel(0, delta);
  await page.evaluate(() => {
    window.__layerStressSending = false;
  });
  return page.evaluate(() => window.__layerStressSample!);
}
