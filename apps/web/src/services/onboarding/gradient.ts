import {
  createEffect,
  createLayer,
  createPage,
  resolveGradientSettings,
  type Composition,
} from "@musart/core";

export const ONBOARDING_PALETTES = ["daydream", "aurora", "ultraviolet"] as const;
export type OnboardingPalette = (typeof ONBOARDING_PALETTES)[number];
interface GradientSession {
  render(
    page: Composition,
    assets: Record<string, never>,
    options: { canRender: () => boolean },
  ): Promise<HTMLCanvasElement>;
  dispose(): Promise<void>;
}
type SessionFactory = () => Promise<GradientSession>;
const createSession: SessionFactory = async () => {
  const { createRenderSession } = await import("@musart/render");
  return createRenderSession({ maxBytes: 24 * 1024 * 1024 });
};

/** A temporary, bounded use of the real Gradient effect, with no document edits or readbacks. */
export class OnboardingGradient {
  private session: Promise<GradientSession> | undefined;
  private frame = 0;
  private busy = false;
  private disposed = false;
  private failed = false;
  private dirty = true;
  private paused = false;
  private phase = 3;
  private lastTime = 0;
  private generation = 0;
  private palette: OnboardingPalette = "daydream";
  private disposal?: Promise<void>;
  private readonly media = matchMedia("(prefers-reduced-motion: reduce)");
  constructor(
    private readonly host: HTMLElement,
    private readonly factory = createSession,
  ) {
    host.dataset.gradientState = "loading";
    document.addEventListener("visibilitychange", this.activity);
    this.media.addEventListener("change", this.activity);
    this.request();
  }
  setPalette(palette: OnboardingPalette) {
    if (this.disposed || palette === this.palette) return;
    this.palette = palette;
    this.generation++;
    this.dirty = true;
    this.request();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.activity();
  }
  private activity = () => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
    this.request();
  };
  private request() {
    if (this.disposed || this.failed || this.busy || this.frame || document.hidden) return;
    if (!this.dirty && (this.paused || this.media.matches)) return;
    this.frame = requestAnimationFrame(this.draw);
  }
  private draw = (timestamp: number) => {
    this.frame = 0;
    if (this.disposed || document.hidden) return;
    if (this.lastTime && timestamp - this.lastTime < 50 && !this.dirty) {
      this.request();
      return;
    }
    if (!this.dirty && (this.paused || this.media.matches)) return;
    if (this.lastTime && !this.paused && !this.media.matches)
      this.phase += Math.min((timestamp - this.lastTime) / 1000, 0.15);
    this.lastTime = timestamp;
    this.dirty = false;
    this.busy = true;
    const generation = this.generation;
    const palette = this.palette;
    const effect = createEffect("gradient", {
      id: "welcome-gradient",
      time: this.phase,
      seed: 42,
      settings: {
        ...resolveGradientSettings({
          preset: palette,
          grain: 0.035,
          saturation: 1.05,
          duration: 24,
          speed: 1,
        }),
      },
    });
    const page = createPage({
      id: "welcome-art",
      width: 384,
      height: 600,
      background: "#201a42",
      layers: [
        createLayer("rectangle", {
          id: "welcome-field",
          x: 0,
          y: 0,
          width: 384,
          height: 600,
          fill: "#ffffff",
          effects: [effect],
        }),
      ],
    });
    const allowed = () => !this.disposed && !document.hidden && generation === this.generation;
    this.session ??= this.factory();
    void this.session
      .then(async (session) => {
        if (!allowed()) return;
        const canvas = await session.render(page, {}, { canRender: allowed });
        if (!allowed()) return;
        if (canvas.parentElement !== this.host) this.host.replaceChildren(canvas);
        this.host.dataset.gradientState = "ready";
        this.host.dataset.gradientPalette = palette;
        this.host.dataset.gradientFrames = String(
          Number(this.host.dataset.gradientFrames ?? 0) + 1,
        );
      })
      .catch((error: unknown) => {
        if (this.disposed || (error instanceof DOMException && error.name === "AbortError")) return;
        this.failed = true;
        this.host.dataset.gradientState = "unavailable";
      })
      .finally(() => {
        this.busy = false;
        this.request();
      });
  };
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    document.removeEventListener("visibilitychange", this.activity);
    this.media.removeEventListener("change", this.activity);
    this.host.replaceChildren();
    this.disposal =
      this.session?.then(
        (session) => session.dispose(),
        () => undefined,
      ) ?? Promise.resolve();
    return this.disposal;
  }
}
