import { memo, useId, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createMascotSurface } from "./render-frame";
import { createBrandPlayback, type BrandActivity } from "./playback";
import type { BrandState } from "./dahlia";
import { brand } from "./config";
import "./messages";
import "./brand.css";

export const MeltLogo = memo(function MeltLogo({
  size = 30,
  decorative = true,
  state = "idle",
  activity,
  className = "",
  interactive = false,
}: {
  size?: number;
  decorative?: boolean;
  state?: BrandState;
  activity?: BrandActivity;
  className?: string;
  interactive?: boolean;
}) {
  const { t } = useTranslation("brand"),
    id = useId().replace(/[^a-zA-Z0-9_-]/g, ""),
    element = useRef<SVGSVGElement>(null);
  const runtime = useRef<ReturnType<typeof createBrandPlayback> | null>(null);
  useLayoutEffect(() => {
    const svg = element.current!;
    const surface = createMascotSurface(svg, `melt-${id}`),
      playback = createBrandPlayback(surface);
    runtime.current = playback;
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) =>
            playback.setVisible(Boolean(entry?.isIntersecting)),
          );
    observer?.observe(svg);
    return () => {
      runtime.current = null;
      observer?.disconnect();
      playback.dispose();
      surface.dispose();
    };
  }, [id]);
  useLayoutEffect(() => {
    if (!interactive) return;
    const owner = element.current?.closest("button,a") ?? element.current;
    if (!owner) return;
    const update = () =>
      runtime.current?.setHovered(
        owner.matches(":hover") || owner.contains(document.activeElement),
      );
    const enter = () => runtime.current?.setHovered(true);
    const leave = () => runtime.current?.setHovered(owner.contains(document.activeElement));
    owner.addEventListener("pointerenter", enter);
    owner.addEventListener("pointerleave", leave);
    owner.addEventListener("focusin", enter);
    owner.addEventListener("focusout", update);
    return () => {
      runtime.current?.setHovered(false);
      owner.removeEventListener("pointerenter", enter);
      owner.removeEventListener("pointerleave", leave);
      owner.removeEventListener("focusin", enter);
      owner.removeEventListener("focusout", update);
    };
  }, [interactive]);
  useLayoutEffect(() => {
    runtime.current?.setState(state);
  }, [state]);
  useLayoutEffect(() => {
    const update = () => {
      const active = activity?.read() ?? true;
      runtime.current?.setActive(active);
      if (element.current) {
        element.current.dataset.brandActive = String(active);
        if (!decorative)
          element.current.setAttribute(
            "aria-label",
            active && state !== "idle" ? t(state) : brand.name,
          );
      }
    };
    update();
    return activity?.subscribe(update);
  }, [activity, state, decorative, t]);
  return (
    <svg
      ref={element}
      xmlns="http://www.w3.org/2000/svg"
      className={`melt-mascot ${className}`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      viewBox={state === "idle" ? "-116 -116 232 232" : "-158 -158 316 316"}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : state === "idle" ? brand.name : t(state)}
      data-brand-state={state}
    />
  );
});
