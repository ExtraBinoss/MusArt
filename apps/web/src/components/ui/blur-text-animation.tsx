// Adapted from the user-supplied BlurTextAnimation for short, deterministic MusArt entrances.
import { Fragment, useCallback, useState, type ComponentProps, type CSSProperties } from "react";
import { Slot } from "radix-ui";
import { cn } from "./utils";
import "./blur-text-animation.css";

export interface WordData {
  text: string;
  /** Seconds; explicit durations are bounded to 0–5 seconds. */
  duration: number;
  /** Seconds; explicit delays are bounded to 0–10 seconds. */
  delay: number;
  blur: number;
  scale?: number;
}
export interface BlurTextAnimationProps {
  text?: string;
  words?: readonly WordData[];
  className?: string;
  style?: CSSProperties;
  /** Typography/color class names from the supplied API; use style for inline CSS values. */
  fontSize?: string;
  fontFamily?: string;
  textColor?: string;
  /** Explicit initial delay in milliseconds. Defaults to zero; there is no loop. */
  animationDelay?: number;
}
export interface BlurRevealProps extends Omit<ComponentProps<"span">, "ref"> {
  asChild?: boolean;
  order?: number;
  durationMs?: number;
  delayMs?: number;
  initialDelayMs?: number;
  blur?: number;
  scale?: number;
  reduced?: boolean;
}
function bound(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value!)) : fallback;
}
/** One mounted owner reveals once. Reordering a retained owner never changes its entrance clock. */
export function BlurReveal({
  asChild = false,
  order = 0,
  durationMs = 150,
  delayMs,
  initialDelayMs = 0,
  blur = 3,
  scale = 1,
  reduced = false,
  className,
  style,
  ...props
}: BlurRevealProps) {
  const [timing] = useState(() => {
    const rank = bound(order, 0, 0, Number.MAX_SAFE_INTEGER);
    return {
      order: rank,
      duration: bound(durationMs, 150, 0, 5000),
      delay: Math.min(
        10000,
        bound(delayMs, Math.min(rank * 4, 48), 0, 10000) + bound(initialDelayMs, 0, 0, 10000),
      ),
      blur: bound(blur, 3, 0, 24),
      scale: bound(scale, 1, 0.5, 1.25),
    };
  });
  const revealRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    let previous = "",
      active = false;
    function release() {
      if (!active) return;
      // Do not overwrite a hint another owner installed during the entrance.
      if (element!.style.willChange === "opacity, transform, filter") {
        if (previous) element!.style.willChange = previous;
        else element!.style.removeProperty("will-change");
      }
      active = false;
    }
    function animation(event: AnimationEvent) {
      if (event.target !== element || event.animationName !== "musart-blur-reveal") return;
      if (event.type === "animationstart") {
        if (active || element!.hasAttribute("data-blur-complete")) return;
        previous = element!.style.willChange;
        element!.style.willChange = "opacity, transform, filter";
        active = true;
      } else {
        release();
        element!.setAttribute("data-blur-complete", "");
      }
    }
    if (
      element.closest('[data-blur-reduced="true"],[data-reduced-motion="true"]') ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      element.setAttribute("data-blur-complete", "");
    element.addEventListener("animationstart", animation);
    element.addEventListener("animationend", animation);
    element.addEventListener("animationcancel", animation);
    return () => {
      element.removeEventListener("animationstart", animation);
      element.removeEventListener("animationend", animation);
      element.removeEventListener("animationcancel", animation);
      release();
    };
  }, []);
  const Component = asChild ? Slot.Root : "span";
  return (
    <Component
      {...props}
      ref={revealRef}
      data-blur-reveal=""
      data-blur-order={timing.order}
      data-blur-reduced={reduced || undefined}
      className={cn("blur-reveal", !asChild && "blur-reveal-inline", className)}
      style={
        {
          ...style,
          "--blur-reveal-duration": `${timing.duration}ms`,
          "--blur-reveal-delay": `${timing.delay}ms`,
          "--blur-reveal-amount": `${timing.blur}px`,
          "--blur-reveal-scale": timing.scale,
        } as CSSProperties
      }
    />
  );
}
/** Text and optional per-word data inherit their surrounding typography and color by default. */
export function BlurTextAnimation({
  text = "",
  words,
  className,
  style,
  fontSize,
  fontFamily,
  textColor,
  animationDelay = 0,
}: BlurTextAnimationProps) {
  const pieces: readonly WordData[] =
    words ??
    text
      .split(/(\s+)/u)
      .filter(Boolean)
      .map((text) => ({ text, duration: 0.15, delay: 0, blur: 3 }));
  let order = 0;
  return (
    <span
      className={cn("blur-text-animation", fontSize, fontFamily, textColor, className)}
      style={style}
    >
      {pieces.map((word, index) => {
        if (!word.text.trim()) return <Fragment key={index}>{word.text}</Fragment>;
        const rank = order++;
        return (
          <Fragment key={`${index}:${word.text}`}>
            <BlurReveal
              order={rank}
              durationMs={word.duration * 1000}
              delayMs={words ? word.delay * 1000 : undefined}
              initialDelayMs={animationDelay}
              blur={word.blur}
              scale={word.scale}
            >
              {word.text}
            </BlurReveal>
            {words && index < pieces.length - 1 ? " " : null}
          </Fragment>
        );
      })}
    </span>
  );
}
export { BlurTextAnimation as Component };
export default BlurTextAnimation;
