import type { CDPSession, Page } from "@playwright/test";
import { installReadbackProbe } from "./readback-probe";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { profileClock } from "./selection-profile";

export interface Point {
  x: number;
  y: number;
}
interface GpuSubmit {
  at: number;
  queue: number;
  source: "main" | "background" | "shared" | "unknown";
}
interface ProbeState {
  commits: Record<string, number>;
  mainRenderer: Record<string, number>;
  activePageId?: string;
  drawnPageId?: string;
  rendererInstances?: string;
}
export interface Request {
  action: string;
  event: "pointerdown" | "pointermove" | "pointerup" | "click" | "contextmenu" | "keydown";
  pageId: string;
  selected: string[];
  point?: Point;
  rulers?: boolean;
  menu?: boolean;
  marquee?: boolean;
  waitForGpu?: boolean;
  waitForInspector?: boolean;
  observeInspectorDisabled?: boolean;
}
export interface ActionSample {
  action: string;
  generatedAt: number;
  dispatchAt: number;
  firstReadyAt: number;
  presentationOpportunityAt: number;
  inspectorReadyAt: number | null;
  gpuReadyAt: number | null;
  generatedToReadyMs: number;
  dispatchToReadyMs: number;
  dispatchToPresentationOpportunityMs: number;
  dispatchToInspectorMs: number | null;
  dispatchToGpuMs: number | null;
  before: ProbeState;
  urgent: ProbeState;
  settled: ProbeState;
  submits: GpuSubmit[];
  inspectorDisabledMutations: {
    attribute: string | null;
    oldValue: string | null;
    value: string | null;
  }[];
}
export interface ActionProbe {
  result?: ActionSample;
  error?: string;
  request?: Request;
  capture?: { generatedAt: number; dispatchAt: number };
  cancel?: () => void;
}
declare global {
  interface Window {
    __editorActionProbe?: ActionProbe;
    __editorGpuProbe?: { submits: GpuSubmit[]; restore: () => void };
  }
}

export async function instrumentGpu(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const submits: GpuSubmit[] = [];
    if (typeof GPUQueue === "undefined" || typeof GPUCanvasContext === "undefined") {
      window.__editorGpuProbe = { submits, restore: () => {} };
      return;
    }
    const sources = new WeakMap<GPUQueue, Set<HTMLCanvasElement | OffscreenCanvas>>();
    const ids = new WeakMap<GPUQueue, number>();
    let nextId = 0;
    const configure = GPUCanvasContext.prototype.configure,
      submit = GPUQueue.prototype.submit;
    GPUCanvasContext.prototype.configure = function (descriptor) {
      const canvases =
        sources.get(descriptor.device.queue) ?? new Set<HTMLCanvasElement | OffscreenCanvas>();
      canvases.add(this.canvas);
      sources.set(descriptor.device.queue, canvases);
      return configure.call(this, descriptor);
    };
    GPUQueue.prototype.submit = function (commands) {
      const canvases = [...(sources.get(this) ?? [])];
      const main = canvases.some(
        (canvas) => canvas instanceof HTMLCanvasElement && canvas.closest(".editor-gpu-scene"),
      );
      const background = canvases.some(
        (canvas) => !(canvas instanceof HTMLCanvasElement) || !canvas.closest(".editor-gpu-scene"),
      );
      let queue = ids.get(this);
      if (queue === undefined) {
        queue = ++nextId;
        ids.set(this, queue);
      }
      submits.push({
        at: performance.now(),
        queue,
        source:
          main && background ? "shared" : main ? "main" : background ? "background" : "unknown",
      });
      return submit.call(this, commands);
    };
    window.__editorGpuProbe = {
      submits,
      restore: () => {
        GPUCanvasContext.prototype.configure = configure;
        GPUQueue.prototype.submit = submit;
      },
    };
  });
}

/** Diagnostic overhead is opt-in and never used as a clean latency cohort. */
export async function startEditorTrace(page: Page, stem: string) {
  if (process.env.MUSART_EDITOR_TRACE !== "1") return async () => null;
  const session = await page.context().newCDPSession(page);
  let cleanupTracing: CDPSession | undefined;
  let profilerStarted = false;
  try {
    const browser = page.context().browser();
    if (!browser) throw new Error("A browser-level CDP tracing session is required.");
    const tracing = await browser.newBrowserCDPSession();
    cleanupTracing = tracing;
    const start = {
      ...(await profileClock(session, page)),
      timeOriginMs: await page.evaluate(() => performance.timeOrigin),
    };
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 1000 });
    await session.send("Profiler.start");
    profilerStarted = true;
    const categories = [
      "devtools.timeline",
      "v8.execute",
      "blink",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.invalidationTracking",
      "blink.user_timing",
      "input",
      "latencyInfo",
    ];
    if (process.env.MUSART_SELECTOR_STATS === "1")
      categories.push("disabled-by-default-blink.debug");
    await tracing.send("Tracing.start", {
      categories: categories.join(","),
      transferMode: "ReturnAsStream",
    });
    return async () => {
      let handle: string | undefined;
      let traceEndRequested = false;
      try {
        await mkdir(dirname(stem), { recursive: true });
        const { profile } = await session.send("Profiler.stop");
        await writeFile(`${stem}.cpuprofile`, JSON.stringify(profile));
        const end = await profileClock(session, page);
        await writeFile(`${stem}-clock.json`, JSON.stringify({ start, end }, null, 2));
        let timer: ReturnType<typeof setTimeout> | undefined;
        let failCompletion!: (error: Error) => void;
        let completeTrace!: (event: { stream?: string }) => void;
        const complete = new Promise<string>((resolve, reject) => {
          failCompletion = reject;
          completeTrace = (event) =>
            event.stream
              ? resolve(event.stream)
              : reject(new Error("Tracing completed without a stream."));
          tracing.once("Tracing.tracingComplete", completeTrace);
        });
        const expired = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Browser tracing completion exceeded 10000 ms.")),
            10000,
          );
        });
        try {
          traceEndRequested = true;
          void tracing.send("Tracing.end").catch(failCompletion);
          handle = await Promise.race([complete, expired]);
          clearTimeout(timer);
          const chunks: string[] = [];
          for (;;) {
            const chunk = await tracing.send("IO.read", { handle, size: 1024 * 1024 });
            chunks.push(
              chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data,
            );
            if (chunk.eof) break;
          }
          const content = JSON.parse(chunks.join(""));
          if (!content.traceEvents?.length)
            throw new Error("Browser trace stream contained no events.");
          await writeFile(
            `${stem}-timeline.json`,
            JSON.stringify({ ...content, start, end, completed: true }),
          );
          return {
            start,
            end,
            completed: true,
            profile: `${stem}.cpuprofile`,
            timeline: `${stem}-timeline.json`,
          };
        } finally {
          clearTimeout(timer);
          tracing.off("Tracing.tracingComplete", completeTrace);
        }
      } finally {
        if (!traceEndRequested) await tracing.send("Tracing.end").catch(() => {});
        if (handle) await tracing.send("IO.close", { handle }).catch(() => {});
        await Promise.allSettled([tracing.detach(), session.detach()]);
      }
    };
  } catch (error) {
    if (profilerStarted) await session.send("Profiler.stop").catch(() => {});
    if (cleanupTracing) await cleanupTracing.detach().catch(() => {});
    await session.detach().catch(() => {});
    throw error;
  }
}

/** Failure evidence is read outside measured RAFs, including the canonical session IDs. */
export function editorDiagnostics(page: Page) {
  return page.evaluate(() => {
    const snapshot = window.musart?.snapshot();
    const marquee = document.querySelector<HTMLElement>(".canvas-marquee");
    const boundary = document.querySelector<HTMLElement>(".inspector-selection-boundary");
    const active = document.activeElement;
    const probe = window.__editorActionProbe;
    return {
      at: performance.now(),
      timeOriginMs: performance.timeOrigin,
      request: probe?.request,
      capture: probe?.capture,
      error: probe?.error,
      pageId: snapshot?.pageId,
      selection: snapshot?.selection,
      selectedFrames: [
        ...document.querySelectorAll<HTMLElement>(".canvas-selection[data-layer-id]"),
      ].map((node) => node.dataset.layerId),
      marquee: marquee
        ? {
            hidden: marquee.hidden,
            left: marquee.style.left,
            top: marquee.style.top,
            width: marquee.style.width,
            height: marquee.style.height,
          }
        : null,
      boundary: boundary
        ? {
            disabled: boundary.hasAttribute("disabled"),
            inert: boundary.hasAttribute("inert"),
            busy: boundary.getAttribute("aria-busy"),
            tag: boundary.tagName,
          }
        : null,
      activeElement:
        active instanceof HTMLElement
          ? {
              tag: active.tagName,
              id: active.id,
              classes: active.className,
              label: active.getAttribute("aria-label"),
            }
          : null,
    };
  });
}

/** Urgent UI, Inspector and canonical GPU clocks stay independent in every sample. */
export async function arm(page: Page, request: Request) {
  await page.evaluate((request) => {
    window.__editorActionProbe?.cancel?.();
    const probe: ActionProbe = { request };
    window.__editorActionProbe = probe;
    const captures = [
      ".musart-app",
      ".inspector",
      ".layers-panel",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ];
    const state = (): ProbeState => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
      return {
        commits: Object.fromEntries(
          captures.map((selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
          ]),
        ),
        mainRenderer: JSON.parse(canvas.dataset.gpuStats!),
        rendererInstances: canvas.dataset.rendererInstances,
        activePageId: document.querySelector<HTMLElement>(
          ".canvas-artboard-editor[data-active=true]",
        )?.dataset.artboardId,
        drawnPageId: canvas.dataset.pageId,
      };
    };
    const mutations: ActionSample["inspectorDisabledMutations"] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target as Element;
        if (node.matches?.(".inspector-selection-boundary") && record.type === "attributes")
          mutations.push({
            attribute: record.attributeName,
            oldValue: record.oldValue,
            value: node.getAttribute(record.attributeName!),
          });
        for (const added of record.addedNodes)
          if (
            added instanceof Element &&
            added.matches(
              '.inspector-selection-boundary[disabled],.inspector-selection-boundary[inert],.inspector-selection-boundary[aria-busy="true"]',
            )
          )
            mutations.push({
              attribute: "inserted-disabled-boundary",
              oldValue: null,
              value: "true",
            });
      }
    });
    if (request.observeInspectorDisabled)
      observer.observe(document.querySelector(".inspector-tabs")!, {
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        childList: true,
        attributeFilter: ["disabled", "inert", "aria-busy"],
      });
    let frame = 0,
      presentationFrame = 0,
      finished = false;
    const cleanup = () => {
      finished = true;
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(presentationFrame);
      observer.disconnect();
      window.removeEventListener(request.event, input, true);
      probe.cancel = undefined;
    };
    const timeout = window.setTimeout(() => {
      probe.error = `Native action did not become ready: ${request.action}`;
      cleanup();
    }, 8000);
    probe.cancel = cleanup;
    const input = (event: Event) => {
      if (request.event === "keydown" && (event as KeyboardEvent).key.toLowerCase() !== "r") return;
      if (
        request.point &&
        "clientX" in event &&
        (Math.abs(Number(event.clientX) - request.point.x) > 1 ||
          Math.abs(Number((event as MouseEvent).clientY) - request.point.y) > 1)
      )
        return;
      window.removeEventListener(request.event, input, true);
      const generatedAt = event.timeStamp,
        dispatchAt = performance.now(),
        before = state();
      probe.capture = { generatedAt, dispatchAt };
      let firstReadyAt = 0,
        presentationOpportunityAt = 0,
        inspectorReadyAt: number | null = null,
        gpuReadyAt: number | null = null;
      let urgent: ProbeState | null = null;
      const finish = () => {
        if (
          !urgent ||
          !presentationOpportunityAt ||
          (request.waitForGpu && gpuReadyAt === null) ||
          (request.waitForInspector !== false && inspectorReadyAt === null)
        )
          return false;
        const end = performance.now();
        probe.result = {
          action: request.action,
          generatedAt,
          dispatchAt,
          firstReadyAt,
          presentationOpportunityAt,
          inspectorReadyAt,
          gpuReadyAt,
          generatedToReadyMs: firstReadyAt - generatedAt,
          dispatchToReadyMs: firstReadyAt - dispatchAt,
          dispatchToPresentationOpportunityMs: presentationOpportunityAt - dispatchAt,
          dispatchToInspectorMs: inspectorReadyAt === null ? null : inspectorReadyAt - dispatchAt,
          dispatchToGpuMs: gpuReadyAt === null ? null : gpuReadyAt - dispatchAt,
          before,
          urgent,
          settled: state(),
          submits: window.__editorGpuProbe!.submits.filter(
            (entry) => entry.at >= dispatchAt && entry.at <= end,
          ),
          inspectorDisabledMutations: mutations,
        };
        cleanup();
        return true;
      };
      const check = () => {
        if (finished) return;
        const active = document.querySelector<HTMLElement>(
          ".canvas-artboard-editor[data-active=true]",
        )?.dataset.artboardId;
        const selected = [
          ...document.querySelectorAll<HTMLElement>(".canvas-selection[data-layer-id]"),
        ]
          .map((node) => node.dataset.layerId!)
          .sort();
        const matchesSelection =
          selected.length === request.selected.length &&
          request.selected.every((id) => selected.includes(id));
        const hasMenu = Boolean(document.querySelector('[role="menu"][data-state="open"]'));
        const marquee = document.querySelector<HTMLElement>(".canvas-marquee");
        const hasMarquee = Boolean(
          marquee && !marquee.hidden && parseFloat(marquee.style.width) > 0,
        );
        const ready =
          active === request.pageId &&
          matchesSelection &&
          (request.rulers === undefined ||
            (document.querySelector<HTMLElement>(".canvas-rulers")?.hidden === false) ===
              request.rulers) &&
          (request.menu === undefined || hasMenu === request.menu) &&
          (request.marquee === undefined || hasMarquee === request.marquee);
        if (!firstReadyAt && ready) {
          firstReadyAt = performance.now();
          urgent = state();
          presentationFrame = requestAnimationFrame(() => {
            presentationOpportunityAt = performance.now();
            finish();
          });
        }
        const inspector = document.querySelector<HTMLElement>(".inspector"),
          boundary = document.querySelector<HTMLElement>(".inspector-selection-boundary");
        if (
          inspectorReadyAt === null &&
          boundary &&
          !boundary.hasAttribute("disabled") &&
          !boundary.hasAttribute("inert") &&
          boundary.getAttribute("aria-busy") !== "true" &&
          (request.selected.length !== 1 ||
            inspector?.dataset.selectedLayerId === request.selected[0])
        )
          inspectorReadyAt = performance.now();
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        if (
          gpuReadyAt === null &&
          data?.pageId === request.pageId &&
          data.rendererReady === "true" &&
          data.sceneRevision === data.renderedRevision
        )
          gpuReadyAt = performance.now();
        if (!finish()) frame = requestAnimationFrame(check);
      };
      frame = requestAnimationFrame(check);
    };
    window.addEventListener(request.event, input, true);
  }, request);
}
export async function result(page: Page) {
  await page.waitForFunction(() =>
    Boolean(window.__editorActionProbe?.result || window.__editorActionProbe?.error),
  );
  const probe = await page.evaluate(() => ({
    result: window.__editorActionProbe?.result,
    error: window.__editorActionProbe?.error,
  }));
  if (probe.error || !probe.result) throw new Error(probe.error ?? "Missing native action result");
  return probe.result;
}
