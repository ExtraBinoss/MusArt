import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

const RESET_ANIMATION = "reset-feedback-pulse";
interface Pulse {
  node: HTMLElement;
  animation?: Animation;
  timer?: ReturnType<typeof setTimeout>;
}
function clearPulse(pulse: Pulse): void {
  clearTimeout(pulse.timer);
  pulse.node.removeAttribute("data-resetting");
  pulse.animation?.cancel();
}
function restartAnimation(animation: Animation): void {
  animation.currentTime = 0;
  animation.play();
}

/** Callers own disabled/reduced-motion admission; this owns only the shared visual pulse. */
export function useResetFeedback(ref: RefObject<HTMLElement | null>): () => void {
  const active = useRef<Pulse | null>(null),
    alive = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (active.current) clearPulse(active.current);
      active.current = null;
    };
  }, []);
  return useCallback(() => {
    const node = ref.current;
    if (!alive.current || !node) return;
    const previous = active.current;
    clearTimeout(previous?.timer);
    if (previous && previous.node !== node) clearPulse(previous);
    node.setAttribute("data-resetting", "");
    const animation =
      node
        .getAnimations?.()
        .find(
          (candidate) =>
            "animationName" in candidate && candidate.animationName === RESET_ANIMATION,
        ) ?? (previous?.node === node ? previous.animation : undefined);
    if (previous?.node === node && previous.animation && previous.animation !== animation)
      previous.animation.cancel();
    // Retain the owned CSSAnimation through its finished 320–360 ms cleanup window too:
    // browsers may omit a finished, non-filling CSS animation from getAnimations().
    if (animation) restartAnimation(animation);
    const pulse: Pulse = { node, animation };
    active.current = pulse;
    pulse.timer = setTimeout(() => {
      if (active.current !== pulse) return;
      clearPulse(pulse);
      active.current = null;
    }, 360);
  }, [ref]);
}
