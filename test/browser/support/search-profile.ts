import type { Page } from "@playwright/test";

export interface SearchKeySample {
  id: number;
  cycle: number;
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
  echoStatus: "pending" | "observed" | "superseded" | "closed";
  echoAt?: number;
  echoSecondRaf?: number;
  resultsStatus: "pending" | "observed" | "superseded" | "closed";
  resultsAt?: number;
  resultsSecondRaf?: number;
  correctResultCount?: number;
  correctResultText?: string;
  resultQueryAtEcho?: string;
  resultPendingAtEcho?: boolean;
  resultInertAtEcho?: boolean;
  resultBusyAtEcho?: string | null;
  supersededAt?: number;
  supersededBy?: number;
  closedAt?: number;
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

/** Independently observe urgent input echo and committed latest-query results at native RAFs. */
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
    let lastKey = 0,
      cycle = 0,
      frame = 0;
    const watching = new Set<SearchKeySample>();
    const previousFrame = new WeakMap<SearchKeySample, { echo: boolean; results: boolean }>();
    function observe() {
      frame = 0;
      const at = performance.now();
      const dialog = document.querySelector("[data-magic-search]");
      const input = dialog?.querySelector<HTMLInputElement>('[role="combobox"]');
      const region = dialog?.querySelector<HTMLElement>("[cmdk-list]");
      const committed = region?.dataset.searchQuery;
      const pending = region?.dataset.searchPending === "true";
      for (const sample of watching) {
        const previous = previousFrame.get(sample)!;
        if (!dialog || !input) {
          if (!sample.firstRaf && sample.kind === "open") continue;
          sample.closedAt ??= at;
          if (sample.echoStatus === "pending") sample.echoStatus = "closed";
          if (sample.resultsStatus === "pending") sample.resultsStatus = "closed";
          watching.delete(sample);
          continue;
        }
        // Historical second-RAF proxy is retained separately; it does not prove fresh results.
        if (!sample.firstRaf && (sample.kind !== "open" || document.activeElement === input))
          sample.firstRaf = at;
        else if (sample.firstRaf && !sample.secondRaf) {
          sample.secondRaf = at;
          sample.observedValue = input.value;
          sample.options = region?.querySelectorAll('[role="option"]').length ?? 0;
          sample.resultText = region?.textContent ?? "";
        }
        const latest = !sample.supersededAt && input.value === sample.value;
        if (latest && sample.echoStatus === "pending") {
          sample.echoStatus = "observed";
          sample.echoAt = at;
          sample.resultQueryAtEcho = committed;
          sample.resultPendingAtEcho = pending;
          sample.resultInertAtEcho = region?.hasAttribute("inert");
          sample.resultBusyAtEcho = region?.getAttribute("aria-busy");
        } else if (latest && previous.echo && sample.echoAt && !sample.echoSecondRaf)
          sample.echoSecondRaf = at;
        const correct = latest && committed === sample.value && !pending;
        if (correct && sample.resultsStatus === "pending") {
          sample.resultsStatus = "observed";
          sample.resultsAt = at;
          sample.correctResultCount = region?.querySelectorAll('[role="option"]').length ?? 0;
          sample.correctResultText = region?.textContent ?? "";
        } else if (correct && previous.results && sample.resultsAt && !sample.resultsSecondRaf)
          sample.resultsSecondRaf = at;
        previous.echo = latest;
        previous.results = correct;
        if (sample.kind === "open" && !sample.settledAt) {
          const nodes = [dialog, dialog.querySelector(".magic-search-surface")].filter(
            (node): node is Element => Boolean(node),
          );
          if (
            nodes.every((node) => {
              const style = getComputedStyle(node);
              const matrix = new DOMMatrixReadOnly(style.transform);
              return Number(style.opacity) >= 0.995 && Math.abs(matrix.m42) < 0.1;
            })
          )
            sample.settledAt = at;
        }
        const echoDone =
          sample.echoStatus !== "pending" &&
          (Boolean(sample.echoSecondRaf) || Boolean(sample.supersededAt));
        const resultsDone =
          sample.resultsStatus !== "pending" &&
          (Boolean(sample.resultsSecondRaf) || Boolean(sample.supersededAt));
        if (
          sample.secondRaf &&
          echoDone &&
          resultsDone &&
          (sample.kind !== "open" || sample.settledAt)
        )
          watching.delete(sample);
      }
      if (watching.size) frame = requestAnimationFrame(observe);
    }
    function record(kind: SearchKeySample["kind"], value: string, event: Event) {
      const at = performance.now();
      if (kind === "open") cycle++;
      const sample: SearchKeySample = {
        id: state.samples.length + 1,
        cycle,
        kind,
        value,
        generated: kind === "input" ? lastKey || event.timeStamp : event.timeStamp,
        dispatch: at,
        firstRaf: 0,
        secondRaf: 0,
        observedValue: "",
        options: 0,
        resultText: "",
        echoStatus: "pending",
        resultsStatus: "pending",
      };
      if (kind === "input")
        for (const previous of watching) {
          if (previous.cycle !== cycle || previous.supersededAt) continue;
          previous.supersededAt = at;
          previous.supersededBy = sample.id;
          if (previous.echoStatus === "pending") previous.echoStatus = "superseded";
          if (previous.resultsStatus === "pending") previous.resultsStatus = "superseded";
        }
      state.samples.push(sample);
      previousFrame.set(sample, { echo: false, results: false });
      watching.add(sample);
      if (!frame) frame = requestAnimationFrame(observe);
    }
    function key(event: KeyboardEvent) {
      lastKey = event.timeStamp;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector("[data-magic-search]")
      )
        record("open", "", event);
    }
    function input(event: Event) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.closest("[data-magic-search]") &&
        target.value
      )
        record("input", target.value, event);
    }
    window.addEventListener("keydown", key, true);
    window.addEventListener("input", input, true);
    state.stop = () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("input", input, true);
      tasks.disconnect();
      cancelAnimationFrame(frame);
      watching.clear();
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
