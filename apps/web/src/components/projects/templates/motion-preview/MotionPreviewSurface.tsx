import { useEffect, useRef } from "react";
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
  useEffect(() => {
    const element = root.current;
    const host = viewport.current;
    const owner = element?.closest("button");
    if (!element || !host || !owner) return;
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let generation = 0;
    let pointerDown = false;
    let preview: PreviewOwner | null = null;
    function status(value: PreviewStatus, error?: unknown) {
      if (!alive || !element) return;
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
        pointerDown ||
        owner!.disabled ||
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
    function focusOut(event: FocusEvent) {
      if (!(event.relatedTarget instanceof Node) || !owner!.contains(event.relatedTarget)) stop();
    }
    function beginPointer() {
      pointerDown = true;
      stop();
    }
    function endPointer() {
      pointerDown = false;
    }
    owner.addEventListener("pointerenter", start);
    owner.addEventListener("pointerleave", stop);
    owner.addEventListener("focusin", start);
    owner.addEventListener("focusout", focusOut);
    owner.addEventListener("pointerdown", beginPointer);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("scroll", stop, true);
    hover.addEventListener("change", stop);
    reduced.addEventListener("change", stop);
    // A metadata/page rebind can mount under an existing pointer without another pointerenter event.
    if (owner.matches(":hover") || owner.contains(document.activeElement))
      start(new Event("focusin"));
    return () => {
      stop();
      alive = false;
      owner.removeEventListener("pointerenter", start);
      owner.removeEventListener("pointerleave", stop);
      owner.removeEventListener("focusin", start);
      owner.removeEventListener("focusout", focusOut);
      owner.removeEventListener("pointerdown", beginPointer);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("blur", stop);
      window.removeEventListener("scroll", stop, true);
      hover.removeEventListener("change", stop);
      reduced.removeEventListener("change", stop);
    };
  }, [startPreview, disabled, t]);
  return (
    <span ref={root} className={`motion-template-preview ${className}`} data-preview-status="idle">
      {poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : children}
      <span ref={viewport} className="motion-template-preview-canvas" aria-hidden />
      <span ref={feedback} className="motion-template-preview-status" role="status" />
    </span>
  );
}
