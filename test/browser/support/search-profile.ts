import type { Page } from "@playwright/test";

export interface SearchKeySample {
  kind: "open" | "input";
  value: string;
  generated: number;
  dispatch: number;
  firstRaf: number;
  secondRaf: number;
  settledAt?: number;
  observedValue: string;
  options: number;
  resultText: string;
}
export interface SearchProfileState {
  samples: SearchKeySample[];
  longTasks: { start: number; duration: number }[];
  submissions: number;
  adapter?: Record<string, string | boolean>;
  stop?: () => void;
}
declare global {
  interface Window {
    __searchProfile?: SearchProfileState;
  }
}

/** Native capture clocks and two presentation opportunities, without document snapshots. */
export async function installSearchProfile(page: Page) {
  await page.addInitScript(() => {
    const state: SearchProfileState = {
      samples: [],
      longTasks: [],
      submissions: 0,
    };
    window.__searchProfile = state;
    const gpu = navigator.gpu;
    if (gpu) {
      const request = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await request(...args);
        if (adapter) {
          const info = adapter.info;
          state.adapter = {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
            fallback: info.isFallbackAdapter,
          };
        }
        return adapter;
      };
    }
    if (typeof GPUQueue !== "undefined") {
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (commands) {
        state.submissions++;
        return submit.call(this, commands);
      };
    }
    const tasks = new PerformanceObserver((entries) => {
      state.longTasks.push(
        ...entries.getEntries().map((entry) => ({
          start: entry.startTime,
          duration: entry.duration,
        })),
      );
    });
    tasks.observe({ type: "longtask", buffered: false });
    let lastKey: { generated: number; dispatch: number } | undefined;
    const frames = new Set<number>();
    function frame(callback: FrameRequestCallback) {
      const id = requestAnimationFrame((at) => {
        frames.delete(id);
        callback(at);
      });
      frames.add(id);
    }
    function sample(kind: SearchKeySample["kind"], value: string, event: Event) {
      const sample: SearchKeySample = {
        kind,
        value,
        generated: kind === "input" ? (lastKey?.generated ?? event.timeStamp) : event.timeStamp,
        dispatch: performance.now(),
        firstRaf: 0,
        secondRaf: 0,
        observedValue: "",
        options: 0,
        resultText: "",
      };
      const check = () => {
        const input = document.querySelector<HTMLInputElement>(
          '[data-magic-search] [role="combobox"]',
        );
        if (kind === "open" && (!input || document.activeElement !== input)) {
          frame(check);
          return;
        }
        sample.firstRaf = performance.now();
        frame(() => {
          const dialog = document.querySelector("[data-magic-search]");
          sample.secondRaf = performance.now();
          sample.observedValue = input?.value ?? "";
          sample.options = dialog?.querySelectorAll('[role="option"]').length ?? 0;
          sample.resultText = dialog?.querySelector("[cmdk-list]")?.textContent ?? "";
          state.samples.push(sample);
          if (kind === "open") {
            const settled = () => {
              const nodes = [dialog, dialog?.querySelector(".magic-search-surface")].filter(
                (node): node is Element => Boolean(node),
              );
              const ready = nodes.every((node) => {
                const style = getComputedStyle(node);
                const matrix = new DOMMatrixReadOnly(style.transform);
                return Number(style.opacity) >= 0.995 && Math.abs(matrix.m42) < 0.1;
              });
              if (ready) sample.settledAt = performance.now();
              else frame(settled);
            };
            frame(settled);
          }
        });
      };
      frame(check);
    }
    function key(event: KeyboardEvent) {
      lastKey = { generated: event.timeStamp, dispatch: performance.now() };
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector("[data-magic-search]")
      )
        sample("open", "", event);
    }
    function input(event: Event) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.closest("[data-magic-search]") &&
        target.value
      )
        sample("input", target.value, event);
    }
    window.addEventListener("keydown", key, true);
    window.addEventListener("input", input, true);
    state.stop = () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("input", input, true);
      tasks.disconnect();
      for (const id of frames) cancelAnimationFrame(id);
    };
  });
}

/** Small actual renderer/React counters, intentionally no engine document cloning. */
export async function searchSurfaceCounters(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    return {
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
          ],
        ),
      ),
      backend: canvas.dataset.backend,
      gpu: JSON.parse(canvas.dataset.gpuStats ?? "{}") as Record<string, number>,
      instances: canvas.dataset.rendererInstances,
      submissions: window.__searchProfile!.submissions,
      readbacks: { ...window.__musartVideoReadbacks! },
    };
  });
}
