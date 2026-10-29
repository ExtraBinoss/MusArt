import type { Page } from "@playwright/test";
import { installReadbackProbe } from "./readback-probe";

export interface InteractionSample {
  kind: "lock" | "receipt";
  generatedAt: number;
  dispatchAt: number;
  firstReadyAt: number;
  settledAt: number;
  generatedToReadyMs: number;
  dispatchToReadyMs: number;
  entranceMs: number;
  beforeCommits: Record<string, number>;
  afterCommits: Record<string, number>;
  beforeGpu: Record<string, number>;
  afterGpu: Record<string, number>;
  gpuQueueHook: boolean;
  submissionsBeforeReady: number[];
  submissionsThroughSettled: number[];
  firstReadyControls?: { total: number; missing: string[]; placeholders: number };
  focusInside?: boolean;
  entranceAnimations?: { name: string; duration: number | string }[];
  longTasks: { start: number; duration: number }[];
}
interface Probe {
  submits: number[];
  gpuQueueHook: boolean;
  capture?: Promise<InteractionSample>;
  cancel?: () => void;
  restore?: () => void;
}
declare global {
  interface Window {
    __interactionProbe?: Probe;
  }
}

/** All GPU queue instances in this page, including background thumbnail renderers. */
export async function installInteractionProbe(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const probe: Probe = { submits: [], gpuQueueHook: typeof GPUQueue !== "undefined" };
    window.__interactionProbe = probe;
    if (typeof GPUQueue !== "undefined") {
      const original = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (commands) {
        probe.submits.push(performance.now());
        return original.call(this, commands);
      };
      probe.restore = () => {
        GPUQueue.prototype.submit = original;
      };
    }
  });
}

/** Arms before native input; only DOM counters/readiness are inspected in measured RAFs. */
export async function armInteraction(
  page: Page,
  options: {
    kind: "lock" | "receipt";
    trigger: string;
    layerId: string;
    controls?: { key: string; selector: string }[];
  },
) {
  await page.evaluate((options) => {
    const probe = window.__interactionProbe!;
    probe.cancel?.();
    const surfaces = [
      ".musart-app",
      ".inspector",
      ".layers-panel",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ];
    const commits = () =>
      Object.fromEntries(
        surfaces.map((selector) => {
          const value = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
          if (value === undefined) throw new Error(`Missing actual React counter: ${selector}`);
          return [selector, Number(value)];
        }),
      );
    const gpu = () =>
      JSON.parse(
        document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!.dataset.gpuStats!,
      ) as Record<string, number>;
    const tasks: InteractionSample["longTasks"] = [];
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries())
        tasks.push({ start: entry.startTime, duration: entry.duration });
    });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
      observer.observe({ type: "longtask", buffered: false });
    let frame = 0,
      firstReadyAt = 0,
      dispatchAt = 0,
      generatedAt = 0;
    let beforeCommits: Record<string, number>, beforeGpu: Record<string, number>;
    let firstReadyControls: InteractionSample["firstReadyControls"];
    let entranceAnimations: InteractionSample["entranceAnimations"];
    let rejectCapture: (reason: Error) => void;
    let pointer: (event: PointerEvent) => void;
    const cleanup = () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      for (const entry of observer.takeRecords())
        tasks.push({ start: entry.startTime, duration: entry.duration });
      observer.disconnect();
      window.removeEventListener("pointerdown", pointer, true);
      probe.cancel = undefined;
    };
    const timeout = setTimeout(() => {
      cleanup();
      rejectCapture(new Error("Native interaction readiness was not observed."));
    }, 10000);
    probe.capture = new Promise<InteractionSample>((resolve, reject) => {
      rejectCapture = reject;
      function finish(now: number, popup?: HTMLElement) {
        cleanup();
        resolve({
          kind: options.kind,
          generatedAt,
          dispatchAt,
          firstReadyAt,
          settledAt: now,
          generatedToReadyMs: firstReadyAt - generatedAt,
          dispatchToReadyMs: firstReadyAt - dispatchAt,
          entranceMs: now - dispatchAt,
          beforeCommits,
          afterCommits: commits(),
          beforeGpu,
          afterGpu: gpu(),
          gpuQueueHook: probe.gpuQueueHook,
          submissionsBeforeReady: probe.submits.filter(
            (at) => at >= dispatchAt && at <= firstReadyAt,
          ),
          submissionsThroughSettled: probe.submits.filter((at) => at >= dispatchAt && at <= now),
          firstReadyControls,
          focusInside: popup?.contains(document.activeElement),
          entranceAnimations,
          longTasks: tasks.filter(
            (task) => task.start <= now && task.start + task.duration >= dispatchAt,
          ),
        });
      }
      function poll() {
        const now = performance.now();
        if (options.kind === "lock") {
          const row = document.querySelector<HTMLElement>(
            `.layer-row[data-layer-id="${options.layerId}"]`,
          );
          const selected = document.querySelector<HTMLElement>(
            `.canvas-selection[data-layer-id="${options.layerId}"]`,
          );
          if (
            row?.dataset.locked === "true" &&
            row.querySelector(".layer-lock-label") &&
            document.querySelector(".inspector .locked-layer-notice") &&
            selected?.dataset.locked === "true" &&
            selected.querySelector(".canvas-layer-lock") &&
            !selected.querySelector("[data-handle]")
          ) {
            firstReadyAt = now;
            finish(now);
            return;
          }
        } else {
          const popup = document.querySelector<HTMLElement>(
            '.layer-attachment-popover[data-state="open"]',
          );
          if (
            popup &&
            Number(getComputedStyle(popup).opacity) > 0 &&
            popup.getBoundingClientRect().height > 0
          ) {
            if (!firstReadyAt) {
              firstReadyAt = now;
              const controls = popup.querySelector(".effect-controls");
              firstReadyControls = {
                total: options.controls!.length,
                missing: options
                  .controls!.filter((control) => !controls?.querySelector(control.selector))
                  .map((control) => control.key),
                placeholders: popup.querySelectorAll("[data-effect-parameter-placeholder]").length,
              };
              entranceAnimations = popup
                .getAnimations({ subtree: true })
                .filter(
                  (animation) => animation.effect?.getComputedTiming().iterations !== Infinity,
                )
                .map((animation) => {
                  const duration = animation.effect!.getTiming().duration;
                  return {
                    name: "animationName" in animation ? String(animation.animationName) : "WAAPI",
                    duration: typeof duration === "number" ? duration : String(duration ?? "auto"),
                  };
                });
            }
            const moving = popup
              .getAnimations({ subtree: true })
              .some(
                (animation) =>
                  animation.effect?.getComputedTiming().iterations !== Infinity &&
                  (animation.playState === "running" || animation.pending),
              );
            if (!moving) {
              finish(now, popup);
              return;
            }
          }
        }
        frame = requestAnimationFrame(poll);
      }
      function start(event: PointerEvent) {
        if (
          event.button !== 0 ||
          !(event.target instanceof Element) ||
          !event.target.closest(options.trigger)
        )
          return;
        window.removeEventListener("pointerdown", pointer, true);
        generatedAt = event.timeStamp;
        dispatchAt = performance.now();
        beforeCommits = commits();
        beforeGpu = gpu();
        frame = requestAnimationFrame(poll);
      }
      pointer = start;
      window.addEventListener("pointerdown", pointer, { capture: true, passive: true });
    });
    // Keep a timeout failure handled while the driver is still dispatching its native click.
    void probe.capture.catch(() => undefined);
    probe.cancel = () => {
      cleanup();
      rejectCapture(new Error("Interaction probe cancelled."));
    };
  }, options);
}

export function interactionResult(page: Page) {
  return page.evaluate(() => window.__interactionProbe!.capture!);
}
export async function releaseInteractionProbe(page: Page) {
  await page.evaluate(() => {
    window.__interactionProbe?.cancel?.();
    window.__interactionProbe?.restore?.();
    delete window.__interactionProbe;
  });
}
export async function interactionEnvironment(page: Page) {
  return page.evaluate(async () => {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    const info = adapter?.info;
    return {
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .backend,
      entryScript: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src,
      gpuQueueHook: window.__interactionProbe?.gpuQueueHook,
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
}
