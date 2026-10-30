import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  motionTimeToSeconds,
  normalizeMotionTime,
  type MotionTime,
  type Project,
} from "@musart/core";
import { createRenderSession } from "../standalone";
import { MotionExportError } from "./errors";
import type { MotionPreviewOptions, MotionPreviewState } from "./preview-model";

/** A local wall clock and one acknowledged GPU job; no editor, history or transport dependency. */
export function createMotionPreview(project: Project, options: MotionPreviewOptions) {
  const assets = structuredClone(project.assets);
  const program = compileMotion({ ...project, assets }, { compositionId: options.compositionId });
  if (program.mode !== "motion" || !program.duration)
    throw new MotionExportError(
      "missingMotion",
      "Motion preview requires an authored Motion composition.",
    );
  const edge = options.edge ?? 768;
  if (!Number.isInteger(edge) || edge < 16 || edge > 768)
    throw new MotionExportError("invalidOptions", "Motion preview edge must be 16–768 pixels.");
  const scheduler = options.scheduler ?? {
    now: () => performance.now(),
    request: (callback: () => void) => requestAnimationFrame(callback),
    cancel: (handle: number) => cancelAnimationFrame(handle),
  };
  const duration = motionTimeToSeconds(program.duration);
  const frameRate = Math.min(
    30,
    program.composition.motion!.frameRate.numerator /
      program.composition.motion!.frameRate.denominator,
  );
  const session = createRenderSession({
    mediaResolver: options.mediaResolver,
    fontResolver: options.fontResolver,
    forceWebGL: options.forceWebGL,
    maxBytes: options.maxGpuBytes ?? 256 * 1024 * 1024,
    mediaMode: "exact",
  });
  const abort = new AbortController(),
    listeners = new Set<() => void>();
  let state: MotionPreviewState = {
    playing: true,
    time: { value: 0, rate: 1 },
    duration: program.duration,
    busy: false,
    error: null,
  };
  let frame: number | null = null,
    pending: Promise<void> | null = null;
  let anchor: number | null = null,
    generation = 0,
    dirty = true,
    closed = false;
  let disposal: Promise<void> | null = null;
  const publish = (next: Partial<MotionPreviewState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const clock = () =>
    anchor === null
      ? motionTimeToSeconds(state.time)
      : Math.max(0, (scheduler.now() - anchor) / 1000) % duration;
  const sample = (seconds: number) =>
    normalizeMotionTime({ value: Math.round(seconds * 1_000_000), rate: 1_000_000 });
  const schedule = () => {
    if (!closed && !state.error && frame === null && !pending && (state.playing || dirty))
      frame = scheduler.request(() => {
        frame = null;
        paint();
      });
  };
  const paint = () => {
    if (closed || pending || state.error) return;
    const seconds = state.playing
      ? Math.floor(clock() * frameRate) / frameRate
      : motionTimeToSeconds(state.time);
    const owner = generation,
      time = sample(seconds);
    if (!dirty && time.value === state.time.value && time.rate === state.time.rate) {
      schedule();
      return;
    }
    const plan = evaluateMotion(program, time);
    dirty = false;
    publish({ busy: true });
    const job = session.withCanvasFrame(
      applyMotionFrame(program, plan),
      assets,
      (canvas) => {
        if (!closed && owner === generation) options.onFrame(canvas, session.stats()?.backend);
      },
      {
        scale: Math.min(1, edge / Math.max(program.composition.width, program.composition.height)),
        motionFrame: plan,
        mediaMode: "exact",
        signal: abort.signal,
      },
    );
    pending = job
      .then(
        () => {
          if (closed || owner !== generation) return;
          if (state.playing && anchor === null)
            anchor = scheduler.now() - motionTimeToSeconds(time) * 1000;
          publish({ time, busy: false });
        },
        (error: unknown) => {
          if (!closed) publish({ playing: false, busy: false, error });
        },
      )
      .finally(() => {
        pending = null;
        if (state.error && !closed) {
          disposal ??= session.dispose();
          void disposal.catch((cleanup: unknown) => {
            if (!closed)
              publish({
                error: new AggregateError([state.error, cleanup], "Motion preview cleanup failed."),
              });
          });
        }
        schedule();
      });
  };
  schedule();
  return {
    read: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    play() {
      if (closed || state.error || state.playing) return;
      anchor = scheduler.now() - motionTimeToSeconds(state.time) * 1000;
      publish({ playing: true });
      schedule();
    },
    pause() {
      if (closed || !state.playing) return;
      const time = sample(clock());
      anchor = null;
      generation++;
      dirty = true;
      publish({ playing: false, time });
      schedule();
    },
    seek(time: MotionTime) {
      if (closed || state.error) return;
      const seconds = Math.max(
        0,
        Math.min(duration, motionTimeToSeconds(normalizeMotionTime(time))),
      );
      generation++;
      anchor = state.playing ? scheduler.now() - seconds * 1000 : null;
      dirty = true;
      publish({ time: sample(seconds) });
      schedule();
    },
    dispose() {
      if (!closed) {
        closed = true;
        generation++;
        abort.abort();
        if (frame !== null) scheduler.cancel(frame);
        frame = null;
        listeners.clear();
      }
      disposal ??= (async () => {
        await pending;
        await session.dispose();
      })();
      return disposal;
    },
  };
}
