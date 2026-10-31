import { beginProjectTiming } from "../../../../services/performance/project-timing";
import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  motionTimeToSeconds,
  type Project,
} from "@musart/core";
import type {
  createRenderSession,
  FontResolver,
  MediaSourceResolver,
  RenderOptions,
} from "@musart/render";
import {
  prepareMotionTemplate,
  type PreparedMotionTemplate,
} from "../../../../services/projects/templates/motion/loader";
import type { MotionTemplateId } from "../../../../services/projects/templates/motion/model";
import { PreviewSessionPool } from "./session-pool";
import { PreviewSourceCache } from "./source-cache";

export type PreviewStatus = "idle" | "loading" | "playing" | "paused" | "failed";
type Session = Pick<ReturnType<typeof createRenderSession>, "withCanvasFrame" | "dispose">;
export interface PreviewDependencies {
  prepare: (id: MotionTemplateId, signal: AbortSignal) => Promise<PreparedMotionTemplate>;
  createSession: (options: RenderOptions & { maxBytes: number }) => Promise<Session>;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
}
const sources = new PreviewSourceCache();
const sessions = new PreviewSessionPool(
  async (options) => {
    const { createRenderSession } = await import("@musart/render");
    return createRenderSession(options);
  },
  () => sources.clear(),
);
const native: PreviewDependencies = {
  prepare: (id, signal) =>
    sources.template(id, signal, () => prepareMotionTemplate(id, { signal })),
  createSession: (options) => sessions.acquire(options),
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};
export interface PreviewOwner {
  release: () => Promise<void>;
  setPaused?: (paused: boolean) => void;
}
let active: PreviewOwner | null = null;
async function clearPreviews() {
  await active?.release();
  await sessions.clear();
}
if (typeof document !== "undefined") {
  const hide = () => {
    if (document.hidden) void clearPreviews().catch((error: unknown) => console.error(error));
  };
  const unload = () => {
    void clearPreviews().catch((error: unknown) => console.error(error));
  };
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", unload);
  import.meta.hot?.dispose(() => {
    document.removeEventListener("visibilitychange", hide);
    window.removeEventListener("pagehide", unload);
    unload();
  });
}

export interface MotionPreviewSource {
  readonly project: Project;
  readonly compositionId?: string;
  readonly originals?: PreparedMotionTemplate["originals"];
  readonly mediaResolver?: MediaSourceResolver;
  readonly fontResolver?: FontResolver;
}

/** One owner shared by saved projects and templates; one active frame plus one latest request. */
export function startMotionPreview(
  options: {
    label?: string;
    prepare: (signal: AbortSignal) => Promise<MotionPreviewSource>;
    host: HTMLElement;
    onStatus: (status: PreviewStatus, error?: unknown) => void;
  },
  dependencies: Omit<PreviewDependencies, "prepare"> = native,
): PreviewOwner {
  const timing = beginProjectTiming(options.label ?? "Hover preview");
  const previous = active;
  const abort = new AbortController();
  let stopped = false;
  let session: Session | null = null;
  let frame: number | null = null;
  let requested: number | null = null;
  let draining: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  let began = 0;
  let paused = false;
  let renderGeneration = 0;
  let changePaused: ((next: boolean) => void) | null = null;
  let lastSample = -1;
  let bootstrap: Promise<void> = Promise.resolve();
  function alive() {
    return !stopped && active === owner && !abort.signal.aborted;
  }
  function stop(notify: boolean): Promise<void> {
    if (disposal) return disposal;
    timing?.finish("cancelled");
    stopped = true;
    abort.abort();
    if (frame !== null) dependencies.cancelFrame(frame);
    frame = null;
    requested = null;
    options.host.replaceChildren();
    if (notify) options.onStatus("idle");
    disposal = (async () => {
      try {
        await bootstrap;
        await draining;
        await session?.dispose();
      } finally {
        if (active === owner) active = null;
      }
    })();
    return disposal;
  }
  const owner: PreviewOwner = {
    release: () => stop(true),
    setPaused: (next) => changePaused?.(next),
  };
  active = owner;
  options.onStatus("loading");
  bootstrap = (async () => {
    try {
      timing?.stage("Release previous preview");
      await previous?.release();
      abort.signal.throwIfAborted();
      timing?.stage("Read + validate preview source");
      const source = await options.prepare(abort.signal);
      abort.signal.throwIfAborted();
      const prepared =
        dependencies === native ? { ...source, project: sources.retain(source.project) } : source;
      timing?.identify(prepared.project.name);
      abort.signal.throwIfAborted();
      const page = prepared.compositionId
        ? prepared.project.pages.find((item) => item.id === prepared.compositionId)
        : prepared.project.pages[0];
      if (!page) throw new Error("The saved Motion preview artboard is no longer available.");
      timing?.stage("Compile animation");
      const program =
        dependencies === native
          ? sources.compile(prepared.project, page.id)
          : compileMotion(prepared.project, { compositionId: page.id });
      if (program.mode !== "motion" || !program.duration)
        throw new Error("The preview does not contain a Motion composition.");
      const duration = motionTimeToSeconds(program.duration);
      const mediaResolver: MediaSourceResolver = prepared.mediaResolver ?? {
        resolveOriginal: async (asset, request) => {
          abort.signal.throwIfAborted();
          request?.signal?.throwIfAborted();
          const original = prepared.originals?.find(
            (item) =>
              item.originalId === asset.originalId &&
              item.contentRevision === asset.contentRevision,
          );
          if (!original) throw new Error("The preview video original is missing.");
          return original.blob;
        },
      };
      timing?.stage("Acquire GPU preview session (reuse when compatible)");
      session = await dependencies.createSession({
        maxBytes: 128 * 1024 * 1024,
        fontResolver: prepared.fontResolver,
        mediaResolver,
        mediaMode: "exact",
        signal: abort.signal,
      });
      abort.signal.throwIfAborted();
      const scale = Math.min(1, 480 / Math.max(page.width, page.height));
      async function render(seconds: number) {
        const plan = evaluateMotion(program, { value: Math.floor(seconds * 30 + 1e-7), rate: 30 });
        const generation = renderGeneration;
        try {
          await session!.withCanvasFrame(
            applyMotionFrame(program, plan),
            prepared.project.assets,
            (canvas) => {
              if (!alive() || paused || generation !== renderGeneration) return;
              if (canvas.parentElement !== options.host) options.host.replaceChildren(canvas);
              options.host.dataset.previewTime = String(seconds);
            },
            {
              scale,
              motionFrame: plan,
              mediaResolver,
              mediaMode: "exact",
              signal: abort.signal,
              canRender: () => alive() && !paused && generation === renderGeneration,
            },
          );
        } catch (error) {
          // A queued/in-flight frame rejected by pause is expected admission cancellation.
          // Never hide actual preparation, decoding or GPU failures.
          if (
            generation !== renderGeneration &&
            error instanceof Error &&
            error.name === "AbortError"
          )
            return;
          throw error;
        }
      }
      function failure(error: unknown) {
        if (!alive()) return;
        options.onStatus("failed", error);
        void stop(false).catch((cleanupError) => options.onStatus("failed", cleanupError));
      }
      function drain() {
        if (draining || !alive() || paused) return;
        draining = (async () => {
          while (requested !== null && alive() && !paused) {
            const seconds = requested;
            requested = null;
            await render(seconds);
          }
        })()
          .catch(failure)
          .finally(() => {
            draining = null;
          });
      }
      function tick(now: number) {
        if (!alive() || paused) return;
        const sample = Math.floor((((now - began) / 1000) % duration) * 30 + 1e-7);
        if (sample !== lastSample) {
          lastSample = sample;
          requested = sample / 30;
          drain();
        }
        frame = dependencies.requestFrame(tick);
      }
      timing?.stage("First frame: fonts, geometry + GPU render");
      await render(0);
      if (!alive()) return;
      let pausedAt = 0;
      changePaused = (next) => {
        if (!alive() || paused === next) return;
        paused = next;
        if (next) {
          renderGeneration++;
          pausedAt = dependencies.now();
          if (frame !== null) dependencies.cancelFrame(frame);
          frame = null;
          requested = null;
          options.onStatus("paused");
        } else {
          began += dependencies.now() - pausedAt;
          lastSample = -1;
          options.onStatus("playing");
          frame = dependencies.requestFrame(tick);
        }
      };
      options.onStatus("playing");
      timing?.finish("ready");
      began = dependencies.now();
      lastSample = 0;
      frame = dependencies.requestFrame(tick);
    } catch (error) {
      if (alive()) {
        timing?.finish("failed", error);
        options.onStatus("failed", error);
        // Queue cleanup after bootstrap resolves rather than awaiting ourselves.
        queueMicrotask(() => {
          void stop(false).catch((failure) => options.onStatus("failed", failure));
        });
      }
    }
  })();
  return owner;
}

/** Authored templates use the same global GPU admission as saved-project previews. */
export function startMotionTemplatePreview(
  options: {
    templateId: MotionTemplateId;
    host: HTMLElement;
    onStatus: (status: PreviewStatus, error?: unknown) => void;
  },
  dependencies: PreviewDependencies = native,
): PreviewOwner {
  return startMotionPreview(
    {
      ...options,
      label: `Hover template ${options.templateId}`,
      prepare: (signal) => dependencies.prepare(options.templateId, signal),
    },
    dependencies,
  );
}
