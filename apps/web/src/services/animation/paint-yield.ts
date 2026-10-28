/** Let the compositor and R3F present before preparing durable metadata on the main thread. */
export class PaintYield {
  private readonly waiting = new Set<() => void>();
  wait(): Promise<void> {
    return new Promise((resolve) => {
      const page = typeof document === "undefined" ? undefined : document;
      let frame: number | undefined;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (!this.waiting.delete(finish)) return;
        if (frame !== undefined) cancelAnimationFrame(frame);
        clearTimeout(timer);
        page?.removeEventListener("visibilitychange", visibility);
        resolve();
      };
      const visibility = () => {
        if (page?.visibilityState === "hidden") finish();
      };
      this.waiting.add(finish);
      if (typeof requestAnimationFrame === "undefined" || page?.visibilityState === "hidden") {
        timer = setTimeout(finish, 0);
        return;
      }
      // The timeout prevents suspended/browser-throttled frames from blocking persistence forever.
      timer = setTimeout(finish, 250);
      page?.addEventListener("visibilitychange", visibility);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = undefined;
          clearTimeout(timer);
          timer = setTimeout(finish, 0);
        });
      });
    });
  }
  release(): void {
    for (const finish of this.waiting) finish();
  }
}
