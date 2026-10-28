import type {
  CanonicalOrigin,
  CanonicalPresentation,
} from "../../state/session/canonical-presentation";

/** Wait for a useful submitted canonical frame, then yield its browser paint before metadata work. */
export class PaintYield {
  private readonly waiting = new Set<() => void>();
  constructor(private readonly presentation?: CanonicalPresentation) {}
  wait(origin?: CanonicalOrigin): Promise<void> {
    return new Promise((resolve) => {
      const page = typeof document === "undefined" ? undefined : document;
      let frame: number | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stop: (() => void) | undefined;
      const clear = () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
        clearTimeout(timer);
        timer = undefined;
      };
      const finish = () => {
        if (!this.waiting.delete(finish)) return;
        clear();
        stop?.();
        page?.removeEventListener("visibilitychange", visibility);
        resolve();
      };
      const afterFrame = () => {
        frame = undefined;
        timer = setTimeout(() => {
          timer = undefined;
          if (
            !this.presentation ||
            !origin ||
            !this.presentation.read().available ||
            this.presentation.ready(origin)
          )
            finish();
          else update();
        }, 0);
      };
      const update = () => {
        if (!this.waiting.has(finish)) return;
        clear();
        if (page?.visibilityState === "hidden") {
          finish();
          return;
        }
        if (typeof requestAnimationFrame === "undefined") {
          timer = setTimeout(finish, 0);
          return;
        }
        if (this.presentation && origin && this.presentation.read().available) {
          // A healthy visible renderer is awaited, not preempted by an arbitrary frame count.
          if (this.presentation.ready(origin)) frame = requestAnimationFrame(afterFrame);
          return;
        }
        // No publisher, a failed renderer or a headless consumer retains a bounded fallback.
        timer = setTimeout(finish, 250);
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            clearTimeout(timer);
            afterFrame();
          });
        });
      };
      const visibility = () => update();
      this.waiting.add(finish);
      stop = this.presentation?.subscribe(update);
      page?.addEventListener("visibilitychange", visibility);
      update();
    });
  }
  release(): void {
    for (const finish of this.waiting) finish();
  }
}
