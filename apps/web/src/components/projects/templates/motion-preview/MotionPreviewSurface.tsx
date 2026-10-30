import { bindHoverPreview } from "../../../shared/preview/hover-preview";
import { createBrandActivity } from "../../../../ui/brand/activity";
import { BrandStatus } from "../../../../ui/brand/BrandStatus";
import { useEffect, useMemo, useRef } from "react";
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
  const loading = useMemo(() => createBrandActivity(), []);
  useEffect(() => {
    const element = root.current;
    const host = viewport.current;
    const owner = element?.closest<HTMLElement>("[data-preview-owner],button");
    if (!element || !host || !owner) return;
    const carousel = owner.closest("[data-carousel]");
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let generation = 0;
    let preview: PreviewOwner | null = null;
    function status(value: PreviewStatus, error?: unknown) {
      if (!alive || !element) return;
      loading.set(value === "loading");
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
    function start(event: Event) {
      if (
        disabled ||
        !hover.matches ||
        reduced.matches ||
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
    const carouselMotion = () => intent.refresh();
    carousel?.addEventListener("musart:carousel-motion", carouselMotion);
    return () => {
      stop();
      alive = false;
      loading.set(false);
      intent.dispose();
      carousel?.removeEventListener("musart:carousel-motion", carouselMotion);
    };
  }, [startPreview, disabled, t, loading]);
  return (
    <span ref={root} className={`motion-template-preview ${className}`} data-preview-status="idle">
      {poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : children}
      <span ref={viewport} className="motion-template-preview-canvas" aria-hidden />
      <span className="motion-template-preview-loading-mark">
        <BrandStatus size={16} state="preparing" activity={loading} />
      </span>
      <span ref={feedback} className="motion-template-preview-status" role="status" />
    </span>
  );
}
