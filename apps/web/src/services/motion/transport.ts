import {
  applyMotionFrame,
  compileMotion,
  createMotionKeyframePreview,
  evaluateMotion,
  compareMotionTime,
  motionTimeToSeconds,
  validateMotionTime,
  type Composition,
  type MotionFramePlan,
  type EnginePort,
  type MotionTime,
  type MotionFrameRate,
  type MotionProgram,
} from "@musart/core";

export type MotionPlaybackMode = "once" | "loop" | "pingPong";
export interface MotionTransportState {
  readonly compositionId: string;
  readonly mode: "static" | "motion";
  readonly time: MotionTime;
  readonly duration: MotionTime;
  readonly frameRate: MotionFrameRate;
  readonly playing: boolean;
  readonly playbackMode: MotionPlaybackMode;
}
export interface MotionScheduler {
  now(): number;
  request(callback: () => void): number;
  cancel(id: number): void;
}
const browserScheduler: MotionScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};
const ZERO: MotionTime = Object.freeze({ value: 0, rate: 1 });
const sources = new WeakMap<EnginePort, MotionTransport>();

/** Presentation only. Document revision changes compile once; frames never dispatch commands. */
export class MotionTransport {
  private state!: MotionTransportState;
  private program: MotionProgram | null = null;
  private frame: Composition | null = null;
  private framePlan: MotionFramePlan | null = null;
  private project: ReturnType<EnginePort["getSnapshot"]>["project"] | null = null;
  private readonly retained = new Map<
    string,
    { time: MotionTime; playbackMode: MotionPlaybackMode }
  >();
  private readonly listeners = new Set<() => void>();
  private stopEngine: (() => void) | null = null;
  private tickId: number | null = null;
  private anchorTime = 0;
  private anchorClock = 0;
  private disposed = false;
  private draft: MotionProgram | null = null;
  private stopDraft: (() => void) | null = null;

  constructor(
    private readonly engine: EnginePort,
    private readonly scheduler = browserScheduler,
  ) {
    this.sync();
  }

  private stopTick(): void {
    if (this.tickId !== null) this.scheduler.cancel(this.tickId);
    this.tickId = null;
  }

  private sync(): void {
    if (this.disposed) return;
    const snapshot = this.engine.getSnapshot();
    if (this.project === snapshot.project && this.state?.compositionId === snapshot.pageId) return;
    this.stopDraft?.();
    if (this.state)
      this.retained.set(this.state.compositionId, {
        time: this.state.time,
        playbackMode: this.state.playbackMode,
      });
    this.stopTick();
    if (this.project?.id !== snapshot.project.id) this.retained.clear();
    this.project = snapshot.project;
    const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
    const ids = new Set(snapshot.project.pages.map((item) => item.id));
    for (const id of this.retained.keys()) if (!ids.has(id)) this.retained.delete(id);
    const duration = page.motion?.duration ?? { value: 2, rate: 1 };
    const saved = this.retained.get(page.id);
    const time = saved && compareMotionTime(saved.time, duration) <= 0 ? saved.time : ZERO;
    this.state = Object.freeze({
      compositionId: page.id,
      mode: page.motion?.mode ?? "static",
      duration,
      frameRate: page.motion?.frameRate ?? { numerator: 30, denominator: 1 },
      time,
      playing: false,
      playbackMode: saved?.playbackMode ?? "loop",
    });
    this.program =
      page.motion?.mode === "motion"
        ? compileMotion(snapshot.project, { compositionId: page.id })
        : null;
    this.present();
  }

  /** Terminal preview exposes the authored end pose; offline output remains half-open. */
  private present(): void {
    if (!this.program) {
      this.frame = null;
      this.framePlan = null;
      return;
    }
    const program = this.draft ?? this.program;
    this.framePlan = evaluateMotion(program, this.state.time, { terminalPreview: true });
    this.frame = applyMotionFrame(program, this.framePlan);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  read = (): MotionTransportState => {
    this.sync();
    return this.state;
  };
  readFrame = (): Composition | null => {
    this.sync();
    return this.frame;
  };
  readFramePlan = (): MotionFramePlan | null => {
    this.sync();
    return this.framePlan;
  };
  isPreviewing = (): boolean => this.draft !== null;

  /** One latest-only presentation update per frame; no document/history publication. */
  beginKeyframePreview = (ids: readonly string[]) => {
    this.sync();
    this.pause();
    this.stopDraft?.();
    if (!this.program || this.disposed) return undefined;
    const retime = createMotionKeyframePreview(this.program, ids);
    let pending: number | null = null;
    let latest: MotionTime | null = null;
    const clear = () => {
      if (this.stopDraft !== clear) return;
      if (pending !== null) this.scheduler.cancel(pending);
      pending = null;
      latest = null;
      this.stopDraft = null;
      this.draft = null;
    };
    this.stopDraft = clear;
    return {
      update: (delta: MotionTime) => {
        if (this.stopDraft !== clear) return;
        latest = delta;
        if (pending !== null) return;
        pending = this.scheduler.request(() => {
          pending = null;
          this.sync();
          if (this.stopDraft !== clear || !latest) return;
          try {
            this.draft = retime(latest);
          } catch {
            this.draft = null;
          }
          this.present();
          this.emit();
        });
      },
      clear: () => {
        if (this.stopDraft !== clear) return;
        clear();
        this.present();
        this.emit();
      },
    };
  };

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) throw new Error("Motion transport is disposed");
    this.listeners.add(listener);
    if (!this.stopEngine)
      this.stopEngine = this.engine.subscribe(() => {
        this.sync();
        this.emit();
      });
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.stopDraft?.();
        this.stopEngine?.();
        this.stopEngine = null;
        this.stopTick();
        if (this.state.playing) this.state = Object.freeze({ ...this.state, playing: false });
        this.present();
      }
    };
  };

  seek = (requested: MotionTime): void => {
    if (this.disposed) return;
    validateMotionTime(requested);
    this.sync();
    if (!this.state.playing && compareMotionTime(requested, this.state.time) === 0) return;
    this.stopTick();
    const time =
      requested.value < 0
        ? ZERO
        : compareMotionTime(requested, this.state.duration) > 0
          ? this.state.duration
          : Object.freeze({ ...requested });
    this.state = Object.freeze({ ...this.state, time, playing: false });
    this.present();
    this.emit();
  };

  setPlaybackMode = (playbackMode: MotionPlaybackMode): void => {
    if (this.disposed) return;
    if (!["once", "loop", "pingPong"].includes(playbackMode))
      throw new Error("Invalid playback mode");
    this.pause();
    this.state = Object.freeze({ ...this.state, playbackMode });
    this.emit();
  };

  play = (): void => {
    if (this.disposed) return;
    this.sync();
    this.stopDraft?.();
    if (this.state.mode !== "motion" || this.state.playing) return;
    const start =
      compareMotionTime(this.state.time, this.state.duration) >= 0 ? ZERO : this.state.time;
    this.state = Object.freeze({ ...this.state, time: start, playing: true });
    this.anchorTime = motionTimeToSeconds(start);
    this.anchorClock = this.scheduler.now();
    this.present();
    this.emit();
    if (!this.disposed && this.state.playing && this.tickId === null)
      this.tickId = this.scheduler.request(this.tick);
  };

  pause = (): void => {
    this.stopTick();
    if (!this.state.playing) return;
    this.state = Object.freeze({ ...this.state, playing: false });
    this.emit();
  };

  private tick = (): void => {
    this.tickId = null;
    const previous = this.state;
    this.sync();
    if (this.disposed || !this.state.playing) {
      if (this.state !== previous) this.emit();
      return;
    }
    const duration = motionTimeToSeconds(this.state.duration);
    const elapsed = this.anchorTime + Math.max(0, this.scheduler.now() - this.anchorClock) / 1000;
    let seconds = elapsed;
    let playing = true;
    if (this.state.playbackMode === "once") {
      seconds = Math.min(elapsed, duration);
      playing = elapsed < duration;
    } else if (this.state.playbackMode === "loop") seconds = elapsed % duration;
    else {
      const phase = elapsed % (duration * 2);
      seconds = phase > duration ? duration * 2 - phase : phase;
    }
    const rounded = Object.freeze({ value: Math.round(seconds * 1_000_000), rate: 1_000_000 });
    const time =
      !playing || compareMotionTime(rounded, this.state.duration) >= 0
        ? this.state.duration
        : rounded;
    this.state = Object.freeze({ ...this.state, time, playing });
    this.present();
    this.emit();
    if (!this.disposed && this.state.playing && this.tickId === null)
      this.tickId = this.scheduler.request(this.tick);
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.stopDraft?.();
    this.state = Object.freeze({ ...this.state, playing: false });
    this.stopTick();
    this.stopEngine?.();
    this.stopEngine = null;
    this.listeners.clear();
    this.retained.clear();
    this.program = null;
    this.frame = null;
    this.framePlan = null;
    this.project = null;
    if (sources.get(this.engine) === this) sources.delete(this.engine);
  };
}

export function createMotionTransport(engine: EnginePort): MotionTransport {
  let source = sources.get(engine);
  if (!source) {
    source = new MotionTransport(engine);
    sources.set(engine, source);
  }
  return source;
}
