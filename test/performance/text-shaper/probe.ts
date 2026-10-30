import type { Page } from "@playwright/test";

interface Phase {
  label: string;
  projectId: string;
  revision?: number;
  started: number;
  published?: number;
  canonicalAt?: number;
  firstRaf?: number;
  secondRaf?: number;
  failure?: string;
}
interface PreparationMeasure {
  name: string;
  started: number;
  duration: number;
  detail: Record<string, unknown>;
}
interface ShaperProbe {
  phases: Phase[];
  measures: PreparationMeasure[];
  longTasks: { started: number; duration: number }[];
  submits: number;
  wasm: { kind: string; at: number }[];
  adapter?: Record<string, string | boolean>;
  arm(label: string, projectId: string, revision?: number): Phase;
  stop(): void;
}
declare global {
  interface Window {
    __textShaperProfile?: ShaperProbe;
  }
}

export async function installTextShaperProbe(page: Page) {
  await page.addInitScript(() => {
    const frames = new Set<number>();
    const state: ShaperProbe = {
      phases: [],
      measures: [],
      longTasks: [],
      submits: 0,
      wasm: [],
      arm(label, projectId, revision) {
        const previous = this.phases.at(-1);
        if (previous && !previous.secondRaf && !previous.failure)
          throw Error("Unfinished font phase.");
        const sample = { label, projectId, revision, started: performance.now() };
        this.phases.push(sample);
        return sample;
      },
      stop() {},
    };
    window.__textShaperProfile = state;
    const raf = (work: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        work();
      });
      frames.add(id);
    };
    const observer = new MutationObserver(() => {
      const sample = state.phases.at(-1);
      if (!sample || sample.canonicalAt || sample.failure) return;
      const data = document.querySelector<HTMLCanvasElement>(
        ".canvas-artboard-editor canvas",
      )?.dataset;
      if (data?.renderError) {
        sample.failure = data.renderError;
        return;
      }
      if (
        data?.projectId !== sample.projectId ||
        data.rendererReady !== "true" ||
        data.sceneRevision !== data.renderedRevision ||
        (sample.revision !== undefined && Number(data.canonicalRevision) !== sample.revision)
      )
        return;
      sample.canonicalAt = performance.now();
      raf(() => {
        sample.firstRaf = performance.now();
        raf(() => {
          sample.secondRaf = performance.now();
        });
      });
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-project-id",
        "data-renderer-ready",
        "data-rendered-revision",
        "data-canonical-revision",
        "data-render-error",
      ],
    });
    const measurements = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (!entry.name.startsWith("musart:")) continue;
        state.measures.push({
          name: entry.name,
          started: entry.startTime,
          duration: entry.duration,
          detail: (entry as PerformanceMeasure).detail as Record<string, unknown>,
        });
      }
    });
    measurements.observe({ type: "measure", buffered: true });
    const tasks = new PerformanceObserver((entries) => {
      state.longTasks.push(
        ...entries
          .getEntries()
          .map((entry) => ({ started: entry.startTime, duration: entry.duration })),
      );
    });
    tasks.observe({ type: "longtask", buffered: true });
    const nativeSubmit = globalThis.GPUQueue?.prototype.submit;
    if (nativeSubmit)
      GPUQueue.prototype.submit = function (commands) {
        state.submits++;
        return nativeSubmit.call(this, commands);
      };
    const gpu = navigator.gpu,
      nativeAdapter = gpu?.requestAdapter.bind(gpu);
    if (gpu && nativeAdapter)
      gpu.requestAdapter = async (...args) => {
        const adapter = await nativeAdapter(...args);
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
    const nativeModule = WebAssembly.Module,
      nativeInstantiate = WebAssembly.instantiate,
      nativeStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.Module = new Proxy(nativeModule, {
      construct(target, args, newTarget) {
        state.wasm.push({ kind: "Module", at: performance.now() });
        return Reflect.construct(target, args, newTarget);
      },
    });
    WebAssembly.instantiate = new Proxy(nativeInstantiate, {
      apply(target, owner, args) {
        state.wasm.push({ kind: "instantiate", at: performance.now() });
        return Reflect.apply(target, owner, args);
      },
    });
    if (nativeStreaming)
      WebAssembly.instantiateStreaming = new Proxy(nativeStreaming, {
        apply(target, owner, args) {
          state.wasm.push({ kind: "instantiateStreaming", at: performance.now() });
          return Reflect.apply(target, owner, args);
        },
      });
    state.stop = () => {
      observer.disconnect();
      measurements.disconnect();
      tasks.disconnect();
      for (const frame of frames) cancelAnimationFrame(frame);
      if (nativeSubmit) GPUQueue.prototype.submit = nativeSubmit;
      if (gpu && nativeAdapter) gpu.requestAdapter = nativeAdapter;
      WebAssembly.Module = nativeModule;
      WebAssembly.instantiate = nativeInstantiate;
      if (nativeStreaming) WebAssembly.instantiateStreaming = nativeStreaming;
    };
  });
}

export async function textShaperSurface(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard-editor canvas")!;
    const rect = canvas.getBoundingClientRect();
    return {
      data: Object.fromEntries(Object.entries(canvas.dataset)),
      backing: [canvas.width, canvas.height],
      css: [rect.width, rect.height],
      zoom: Number(canvas.closest<HTMLElement>(".canvas-artboard")?.dataset.zoom),
      stats: JSON.parse(canvas.dataset.gpuStats ?? "{}") as Record<string, number>,
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
          ],
        ),
      ),
      reads: { ...window.__musartVideoReadbacks! },
      submits: window.__textShaperProfile!.submits,
    };
  });
}
