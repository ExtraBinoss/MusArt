/** RAF scrolling is active only while an overflow arrow is hovered or held. */
export function installHoverScroll(root: HTMLElement, viewport: HTMLElement) {
  const up = root.querySelector<HTMLButtonElement>('[data-scroll-direction="-1"]');
  const down = root.querySelector<HTMLButtonElement>('[data-scroll-direction="1"]');
  if (!up || !down) return () => {};
  let frame: number | undefined,
    previous = 0,
    direction = 0,
    maximum = 0;
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previous = 0;
    direction = 0;
  }
  function paint() {
    const top = viewport.scrollTop;
    up!.disabled = top <= 1;
    down!.disabled = maximum - top <= 1;
    root.toggleAttribute("data-scroll-up", !up!.disabled);
    root.toggleAttribute("data-scroll-down", !down!.disabled);
    if ((direction < 0 && up!.disabled) || (direction > 0 && down!.disabled)) stop();
  }
  function measure() {
    maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    paint();
  }
  function tick(time: number) {
    frame = undefined;
    if (!direction) return;
    const elapsed = previous ? Math.min(40, time - previous) : 16;
    previous = time;
    viewport.scrollTop = Math.min(
      maximum,
      Math.max(0, viewport.scrollTop + direction * elapsed * 0.28),
    );
    paint();
    if (direction) frame = requestAnimationFrame(tick);
  }
  function start(event: Event) {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) return;
    stop();
    direction = Number(button.dataset.scrollDirection);
    frame = requestAnimationFrame(tick);
  }
  function click(event: Event) {
    const button = event.currentTarget as HTMLButtonElement;
    viewport.scrollTop = Math.min(
      maximum,
      Math.max(0, viewport.scrollTop + Number(button.dataset.scrollDirection) * 96),
    );
    paint();
  }
  const resize = new ResizeObserver(measure);
  function observe() {
    resize.disconnect();
    resize.observe(viewport);
    for (const child of viewport.children) resize.observe(child);
  }
  const mutation = new MutationObserver(observe);
  mutation.observe(viewport, { childList: true });
  observe();
  measure();
  viewport.addEventListener("scroll", paint, { passive: true });
  for (const button of [up, down]) {
    button.addEventListener("pointerenter", start);
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerleave", stop);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("blur", stop);
    button.addEventListener("click", click);
  }
  window.addEventListener("blur", stop);
  document.addEventListener("visibilitychange", stop);
  return () => {
    stop();
    resize.disconnect();
    mutation.disconnect();
    viewport.removeEventListener("scroll", paint);
    window.removeEventListener("blur", stop);
    document.removeEventListener("visibilitychange", stop);
    for (const button of [up, down]) {
      button.removeEventListener("pointerenter", start);
      button.removeEventListener("pointerdown", start);
      button.removeEventListener("pointerleave", stop);
      button.removeEventListener("pointerup", stop);
      button.removeEventListener("pointercancel", stop);
      button.removeEventListener("blur", stop);
      button.removeEventListener("click", click);
    }
  };
}
