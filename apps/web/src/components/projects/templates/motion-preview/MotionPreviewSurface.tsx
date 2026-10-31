import { bindHoverPreview } from "../../../shared/preview/hover-preview";
import { createBrandActivity } from "../../../../ui/brand/activity";
import { BrandStatus } from "../../../../ui/brand/BrandStatus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewOwner, PreviewStatus } from "./runtime";
import type { ReactNode } from "react";
import "./messages";
import "./motion-preview.css";

/** Native intent listeners keep the gallery and landing page out of the frame clock. */
export function MotionPreviewSurface({
  startPreview,
  poster,
  disabled = false,
  className = "",
  children,
}: {
  startPreview: (
    host: HTMLElement,
    onStatus: (status: PreviewStatus, error?: unknown) => void,
  ) => PreviewOwner;
  poster?: string;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("motionPreview");
  const root = useRef<HTMLSpanElement>(null);
  const viewport = useRef<HTMLSpanElement>(null);
  const feedback = useRef<HTMLSpanElement>(null);
  const controls = useRef<HTMLButtonElement>(null);
  const toggle = useRef<() => void>(() => {});
  const [controlHost, setControlHost] = useState<HTMLElement | null>(null);
  const mount = useCallback((node: HTMLSpanElement | null) => {
    root.current = node;
    setControlHost(
      node?.closest<HTMLElement>(".project-preview, .template-card-entry, .library-item-preview") ??
        null,
    );
  }, []);
  const loading = useMemo(() => createBrandActivity(), []);
  useEffect(() => {
    const element = root.current;
    const host = viewport.current;
    const owner =
      element?.closest<HTMLElement>("[data-preview-owner]") ??
      element?.closest<HTMLElement>("button");
    if (!element || !host || !owner) return;
    const carousel = owner.closest("[data-carousel]");
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let generation = 0;
    let preview: PreviewOwner | null = null;
    let currentStatus: PreviewStatus = "idle";
    function status(value: PreviewStatus, error?: unknown) {
      if (!alive || !element) return;
      currentStatus = value;
      loading.set(value === "loading");
      if (controls.current) {
        controls.current.dataset.status = value;
        controls.current.disabled = disabled || value === "loading";
        const label = t(value === "playing" ? "pause" : "play");
        controls.current.setAttribute("aria-label", label);
        controls.current.title = label;
      }
      element.dataset.previewStatus = value;
      element.setAttribute("aria-busy", String(value === "loading"));
      if (feedback.current) {
        feedback.current.textContent =
          value === "failed" ? t("failed") : value === "loading" ? t("loading") : "";
        feedback.current.title = value === "failed" && error instanceof Error ? error.message : "";
      }
    }
    function stop() {
      const current = preview;
      preview = null;
      const token = ++generation;
      if (current) {
        status("idle");
        void current.release().catch((error) => {
          if (generation === token) status("failed", error);
        });
      }
    }
    function start(event: Event, manual = false) {
      if (
        disabled ||
        (!manual && (!hover.matches || reduced.matches)) ||
        document.hidden ||
        carousel?.hasAttribute("data-carousel-moving") ||
        (owner instanceof HTMLButtonElement && owner.disabled) ||
        owner!.matches(":active") ||
        preview ||
        (event instanceof PointerEvent && event.pointerType === "touch")
      )
        return;
      const token = ++generation;
      preview = startPreview(host!, (value, error) => {
        if (generation === token) status(value, error);
      });
    }
    toggle.current = () => {
      if (disabled) return;
      if (!preview || currentStatus === "failed") {
        if (preview) stop();
        start(new Event("click"), true);
      } else if (currentStatus === "playing" || currentStatus === "paused")
        preview.setPaused?.(currentStatus === "playing");
    };
    const intent = bindHoverPreview(owner, {
      enabled: () =>
        !disabled &&
        !(owner instanceof HTMLButtonElement && owner.disabled) &&
        !carousel?.hasAttribute("data-carousel-moving"),
      onChange: (target) => {
        if (target) start(new Event("pointerenter"));
        else stop();
      },
    });
    // Explicit play also works without hover (touch / reduced motion); it needs the
    // same release boundaries even when the hover helper has no active target.
    const leave = () => {
      if (preview) stop();
    };
    const blur = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !owner.contains(event.relatedTarget)) leave();
    };
    const hidden = () => {
      if (document.hidden) leave();
    };
    owner.addEventListener("pointerleave", leave);
    owner.addEventListener("focusout", blur);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hidden);
    const carouselMotion = () => intent.refresh();
    carousel?.addEventListener("musart:carousel-motion", carouselMotion);
    return () => {
      stop();
      alive = false;
      toggle.current = () => {};
      loading.set(false);
      intent.dispose();
      owner.removeEventListener("pointerleave", leave);
      owner.removeEventListener("focusout", blur);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", hidden);
      carousel?.removeEventListener("musart:carousel-motion", carouselMotion);
    };
  }, [startPreview, disabled, t, loading, controlHost]);
  return (
    <span ref={mount} className={`motion-template-preview ${className}`} data-preview-status="idle">
      {poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : children}
      <span ref={viewport} className="motion-template-preview-canvas" aria-hidden />
      <span className="motion-template-preview-loading-mark">
        <BrandStatus size={24} state="preparing" activity={loading} />
      </span>
      <span className="motion-preview-hint" aria-hidden>
        <Play size={12} fill="currentColor" />
        {t("hover")}
      </span>
      {controlHost &&
        createPortal(
          <button
            ref={controls}
            type="button"
            className="motion-preview-control"
            data-preview-control
            data-status="idle"
            aria-label={t("play")}
            title={t("play")}
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggle.current();
            }}
          >
            <Play className="motion-preview-play" size={12} fill="currentColor" />
            <Pause className="motion-preview-pause" size={12} fill="currentColor" />
          </button>,
          controlHost,
        )}
      <span ref={feedback} className="motion-template-preview-status" role="status" />
    </span>
  );
}
