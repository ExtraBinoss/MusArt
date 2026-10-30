import {
  applyMotionFrame,
  evaluateMotion,
  type EnginePort,
  type TransitionStyle,
} from "@musart/core";
import type { createRenderSession } from "@musart/render";
import { createTransitionPreviewDocument } from "./preview-document";

type Session = ReturnType<typeof createRenderSession>;
export interface TransitionPreviewParameters {
  style: TransitionStyle;
  placement: "in" | "out";
  duration: number;
}
interface Owner {
  dispose(): Promise<void>;
}
const owners = new WeakMap<EnginePort, Owner>();

/** One retained renderer per engine, one acknowledged frame, and no work while hidden or idle. */
export function createTransitionPreviewSession(
  engine: EnginePort,
  options: {
    onFrame(canvas: HTMLCanvasElement): void;
    onError(error: unknown): void;
    load?: () => Promise<Pick<typeof import("@musart/render"), "createRenderSession">>;
    scheduler?: { now(): number; request(callback: () => void): number; cancel(id: number): void };
  },
) {
  let retirementFailure: unknown = null;
  const previous = (owners.get(engine)?.dispose() ?? Promise.resolve()).catch((error: unknown) => {
    retirementFailure = error;
  });
  const scheduler = options.scheduler ?? {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  };
  const abort = new AbortController();
  let session: Session | null = null,
    opening: Promise<Session | null> | null = null;
  let program: ReturnType<typeof createTransitionPreviewDocument> | null = null;
  let parameters: TransitionPreviewParameters | null = null;
  let frame: number | null = null,
    pending: Promise<void> | null = null,
    disposal: Promise<void> | null = null;
  let active = false,
    visible = true,
    dirty = false,
    closed = false,
    failed = false;
  let generation = 0,
    anchor = 0,
    rendered = 0,
    previousTick = -1,
    sceneFirstFrame = true;
  function cancelFrame() {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
  }
  function schedule() {
    if (
      closed ||
      failed ||
      !visible ||
      frame !== null ||
      pending ||
      !parameters ||
      (!active && !dirty)
    )
      return;
    frame = scheduler.request(() => {
      frame = null;
      paint();
    });
  }
  function renderer() {
    return (opening ??= (async () => {
      await previous;
      if (retirementFailure) throw retirementFailure;
      if (closed) return null;
      const module = await (options.load ?? (() => import("@musart/render")))();
      if (closed) return null;
      session = module.createRenderSession({ maxBytes: 32 * 1024 * 1024 });
      return session;
    })());
  }
  function paint() {
    if (closed || pending || !parameters || !visible) return;
    const tick = active ? Math.floor(((scheduler.now() - anchor) * 24) / 1000) : -1;
    if (active && !dirty && tick === previousTick) {
      schedule();
      return;
    }
    previousTick = tick;
    const token = generation,
      description = parameters;
    dirty = false;
    const job = (async () => {
      const source = (program ??= createTransitionPreviewDocument(
        description.style,
        description.placement,
        description.duration,
      ));
      const target = await renderer();
      if (!target || closed || !visible || token !== generation) return;
      const duration = description.duration;
      const first = sceneFirstFrame;
      const milliseconds = active
        ? first
          ? 0
          : Math.min(duration, Math.max(0, scheduler.now() - anchor) % (duration + 160))
        : duration / 2;
      const plan = evaluateMotion(
        source,
        { value: Math.round(milliseconds * 1000), rate: 1_000_000 },
        { terminalPreview: true },
      );
      await target.withCanvasFrame(
        applyMotionFrame(source, plan),
        {},
        (canvas) => {
          if (closed || !visible || token !== generation) return;
          if (first) {
            anchor = scheduler.now();
            sceneFirstFrame = false;
          }
          canvas.dataset.transitionStyle = description.style;
          canvas.dataset.previewFrames = String(++rendered);
          canvas.dataset.previewTime = String(milliseconds);
          const backend = target.stats()?.backend;
          if (backend) canvas.dataset.backend = backend;
          options.onFrame(canvas);
        },
        { scale: 1, motionFrame: plan, signal: abort.signal },
      );
    })();
    pending = job
      .catch(async (error: unknown) => {
        if (!closed) {
          failed = true;
          cancelFrame();
          try {
            await session?.dispose();
          } catch (cleanup) {
            error = new AggregateError(
              [error, cleanup],
              "Transition preview rendering and cleanup failed.",
            );
          }
          options.onError(error);
        }
      })
      .finally(() => {
        pending = null;
        schedule();
      });
  }
  const controller = {
    update(next: TransitionPreviewParameters) {
      if (closed) return;
      if (
        !parameters ||
        next.style !== parameters.style ||
        next.placement !== parameters.placement ||
        next.duration !== parameters.duration
      ) {
        parameters = { ...next };
        program = null;
        generation++;
        dirty = true;
        anchor = scheduler.now();
        previousTick = -1;
        sceneFirstFrame = true;
      }
      schedule();
    },
    play(value: boolean) {
      if (closed || active === value) return;
      active = value;
      if (value) generation++;
      cancelFrame();
      if (value) {
        anchor = scheduler.now();
        previousTick = -1;
        dirty = true;
        sceneFirstFrame = true;
      }
      schedule();
    },
    visible(value: boolean) {
      if (closed || visible === value) return;
      visible = value;
      generation++;
      cancelFrame();
      if (value) {
        dirty = true;
        anchor = scheduler.now();
        previousTick = -1;
        sceneFirstFrame = true;
      }
      schedule();
    },
    dispose() {
      if (!closed) {
        closed = true;
        generation++;
        cancelFrame();
        abort.abort();
        if (owners.get(engine) === controller) owners.delete(engine);
      }
      return (disposal ??= (async () => {
        await previous;
        await pending;
        await opening?.catch(() => null);
        await session?.dispose();
        program = null;
      })());
    },
  };
  owners.set(engine, controller);
  return controller;
}
