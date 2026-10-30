/** One quiet density update per zoom/DPR change, independent of React frame subscriptions. */
export function watchDisplayDensity(
  zoom: number,
  update: (density: number) => void,
  surface: Window = window,
): () => void {
  const read = () => {
    const value = surface.devicePixelRatio;
    return Number.isFinite(value) && value > 0 ? value : 1;
  };
  let ratio = read(),
    timer: number | undefined,
    media: MediaQueryList | undefined,
    closed = false;
  const schedule = () => {
    surface.clearTimeout(timer);
    timer = surface.setTimeout(() => {
      timer = undefined;
      if (!closed) update(zoom * ratio);
    }, 140);
  };
  const changed = () => {
    const next = read();
    if (closed || next === ratio) return;
    ratio = next;
    media?.removeEventListener("change", changed);
    arm();
    schedule();
  };
  function arm() {
    media = surface.matchMedia(`(resolution: ${ratio}dppx)`);
    media.addEventListener("change", changed);
  }
  arm();
  surface.addEventListener("resize", changed);
  surface.visualViewport?.addEventListener("resize", changed);
  schedule();
  return () => {
    closed = true;
    surface.clearTimeout(timer);
    media?.removeEventListener("change", changed);
    surface.removeEventListener("resize", changed);
    surface.visualViewport?.removeEventListener("resize", changed);
  };
}
