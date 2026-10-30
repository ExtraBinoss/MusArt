import "./live-number.css";

interface LiveNumberPort {
  read?: () => string;
  write?: (text: string) => void;
}
export interface LiveNumberMotion {
  set(text: string): void;
  reset(text: string): void;
  dispose(): void;
}
const owners = new WeakMap<HTMLElement, LiveNumberMotion>();
const settleMilliseconds = 100;

/** Publish exact values immediately; soften only the pixels during a changing-number burst. */
export function createLiveNumberMotion(
  host: HTMLElement,
  port: LiveNumberPort = {},
): LiveNumberMotion {
  owners.get(host)?.dispose();
  const document = host.ownerDocument;
  const reduced = document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const read = port.read ?? (() => host.textContent ?? "");
  const write =
    port.write ??
    ((text: string) => {
      host.textContent = text;
    });
  const hadClass = host.classList.contains("live-number-motion");
  host.classList.add("live-number-motion");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let changing = false,
    disposed = false,
    lastChanged = 0;
  function stop() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (changing) host.classList.remove("is-live-number-changing");
    changing = false;
  }
  function allowed() {
    return !reduced?.matches && !document.hidden;
  }
  function settle() {
    timer = null;
    if (disposed) return;
    const remaining = settleMilliseconds - (performance.now() - lastChanged);
    if (!allowed() || remaining <= 0) stop();
    else timer = setTimeout(settle, Math.max(1, remaining));
  }
  function policyChanged() {
    if (!allowed()) stop();
  }
  reduced?.addEventListener("change", policyChanged);
  document.addEventListener("visibilitychange", policyChanged);
  const controller: LiveNumberMotion = {
    set(text) {
      if (disposed || read() === text) return;
      write(text);
      if (!allowed()) {
        stop();
        return;
      }
      lastChanged = performance.now();
      if (!changing) {
        changing = true;
        host.classList.add("is-live-number-changing");
      }
      // One wakeup per quiet-window check, never a cleared/restarted timer at every frame.
      if (timer === null) timer = setTimeout(settle, settleMilliseconds);
    },
    reset(text) {
      if (disposed) return;
      stop();
      if (read() !== text) write(text);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      reduced?.removeEventListener("change", policyChanged);
      document.removeEventListener("visibilitychange", policyChanged);
      if (!hadClass) host.classList.remove("live-number-motion");
      if (owners.get(host) === controller) owners.delete(host);
    },
  };
  owners.set(host, controller);
  return controller;
}
