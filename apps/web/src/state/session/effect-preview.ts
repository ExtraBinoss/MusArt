import type { EnginePort } from "@musart/core";

interface Clock {
  now(): number;
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}
interface Options {
  time: number;
  clock: Clock;
  begin(): void;
  preview(time: number): void;
  commit(time: number): void;
  cancel(): void;
  stopped(): void;
}
const active = new WeakMap<EnginePort, Set<(commit?: boolean) => void>>();
const observers = new WeakMap<EnginePort, Set<() => void>>();
const notify = (engine: EnginePort) => observers.get(engine)?.forEach((listener) => listener());
/** Background GPU admission observes start/stop, never every animation frame. */
export function effectPreviewActivity(engine: EnginePort) {
  return {
    busy: () => Boolean(active.get(engine)?.size),
    subscribe(listener: () => void) {
      let listeners = observers.get(engine);
      if (!listeners) observers.set(engine, (listeners = new Set()));
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
/** Freeze explicit phase before export or a new editor gesture. Nothing advances inside shaders. */
export function freezeEffectPreviews(engine: EnginePort, commit = true): void {
  // Finish callbacks can alter the registry. Freeze its current members only.
  const pending = Array.from(active.get(engine) ?? []);
  for (const finish of pending) finish(commit);
}
/** One bounded RAF chain, at most 30 preview publications/s, and one canonical transaction. */
export function startEffectPreview(engine: EnginePort, options: Options) {
  freezeEffectPreviews(engine);
  const origin = engine.getSnapshot();
  let listeners = active.get(engine);
  if (!listeners) active.set(engine, (listeners = new Set()));
  let closed = false,
    frame: number | null = null,
    time = options.time;
  const started = options.clock.now();
  let stopEngine = () => {};
  let last = started;
  const finish = (commit = true) => {
    if (closed) return;
    closed = true;
    if (frame !== null) options.clock.cancel(frame);
    frame = null;
    stopEngine();
    listeners.delete(finish);
    notify(engine);
    // Clear UI state even when a validated command reports an error.
    options.stopped();
    if (commit && time !== options.time) options.commit(time);
    else options.cancel();
  };
  const step = () => {
    frame = null;
    if (closed) return;
    const now = options.clock.now();
    if (now - last >= 1000 / 30) {
      last = now;
      time = (options.time + (now - started) / 1000) % 86400;
      try {
        options.preview(time);
      } catch (error) {
        finish(false);
        throw error;
      }
    }
    if (!closed) frame = options.clock.request(step);
  };
  listeners.add(finish);
  stopEngine = engine.subscribe(() => {
    const current = engine.getSnapshot();
    if (
      current.project !== origin.project ||
      current.revision !== origin.revision ||
      current.pageId !== origin.pageId ||
      current.selection.length !== origin.selection.length ||
      current.selection.some((id, index) => id !== origin.selection[index])
    )
      finish(false);
  });
  notify(engine);
  try {
    options.begin();
    if (!closed) frame = options.clock.request(step);
  } catch (error) {
    finish(false);
    throw error;
  }
  return finish;
}
