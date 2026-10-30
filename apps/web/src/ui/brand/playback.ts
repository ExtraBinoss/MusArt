import { createDahliaEngine, brandStates, type BrandState } from "./dahlia";
import type { createMascotSurface } from "./render-frame";
export interface BrandActivity {
  read(this: void): boolean;
  subscribe(this: void, listener: () => void): () => void;
}
export interface BrandClock {
  now(): number;
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}
const browserClock: BrandClock = {
  now: () => performance.now(),
  request: (tick) => requestAnimationFrame(tick),
  cancel: (id) => cancelAnimationFrame(id),
};
/** At most one on-demand RAF. Idle has no clock; hidden/reduced/offscreen instances do no frame work. */
export function createBrandPlayback(
  surface: Pick<ReturnType<typeof createMascotSurface>, "paint">,
  options: { clock?: BrandClock; document?: Document; reduced?: MediaQueryList } = {},
) {
  const clock = options.clock ?? browserClock,
    page = options.document ?? document,
    reduced = options.reduced ?? matchMedia("(prefers-reduced-motion: reduce)"),
    engine = createDahliaEngine();
  let state: BrandState = "idle",
    time = 0.75,
    end = 0,
    active = true,
    hovered = false,
    visible = true,
    disposed = false,
    frame: number | null = null,
    last: number | null = null,
    paintedAt = -Infinity;
  surface.paint(engine.sample(time));
  function stop() {
    if (frame !== null) clock.cancel(frame);
    frame = null;
    last = null;
  }
  function wantsFrames() {
    return (
      active &&
      visible &&
      !page.hidden &&
      !reduced.matches &&
      (state !== "idle" || hovered || time < end)
    );
  }
  function tick(stamp: number) {
    frame = null;
    if (disposed || !wantsFrames()) return;
    time += last === null ? 0 : Math.min(0.1, Math.max(0, (stamp - last) / 1000));
    last = stamp;
    if (stamp - paintedAt >= 1000 / 30 || (state === "idle" && !hovered && time >= end)) {
      paintedAt = stamp;
      surface.paint(engine.sample(time));
    }
    if (wantsFrames()) frame = clock.request(tick);
  }
  function resume() {
    if (disposed) return;
    if (
      reduced.matches &&
      active &&
      visible &&
      !page.hidden &&
      (state !== "idle" || hovered || time < end)
    ) {
      time = Math.max(time, end);
      surface.paint(engine.sample(time));
    }
    if (!wantsFrames()) {
      stop();
      return;
    }
    if (frame === null) {
      last = clock.now();
      frame = clock.request(tick);
    }
  }
  function environment() {
    stop();
    resume();
  }
  page.addEventListener("visibilitychange", environment);
  reduced.addEventListener("change", environment);
  return {
    setHovered(next: boolean) {
      if (disposed || next === hovered) return;
      hovered = next;
      if (next) engine.blink(time);
      else end = Math.max(end, time + 0.25);
      resume();
    },
    setState(next: BrandState) {
      if (disposed || next === state) return;
      state = next;
      engine.setState(brandStates[next], time);
      end = time + 0.6;
      resume();
    },
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      if (!next) {
        stop();
        surface.paint(createDahliaEngine().sample(0.75));
      } else resume();
    },
    setVisible(next: boolean) {
      if (disposed || next === visible) return;
      visible = next;
      resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      page.removeEventListener("visibilitychange", environment);
      reduced.removeEventListener("change", environment);
    },
  };
}
