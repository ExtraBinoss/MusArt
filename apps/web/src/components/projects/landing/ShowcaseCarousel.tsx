import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { MusArtLogo } from "../../branding/MusArtLogo";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { Button } from "../../ui/button";
import { templatePreview } from "../templates/preview";
import { MotionTemplatePreview } from "../templates/motion-preview/MotionTemplatePreview";
import "../templates/messages";
import "./messages";
import "./motion-showcase.css";

const featured = [
  "afterhours-techno",
  "in-bloom",
  "motion-stress-lab",
  "preset:instagram-story",
  "preset:youtube-thumbnail",
  "preset:instagram-post",
];
const templates = featured.flatMap((id) => TEMPLATE_CATALOG.find((item) => item.id === id) ?? []);

export function ShowcaseCarousel({
  onChoose,
  busy = false,
}: {
  onChoose: (id: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ id: number; x: number; left: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const paint = () => {
      if (previous.current) previous.current.disabled = node.scrollLeft < 2;
      if (next.current)
        next.current.disabled = node.scrollLeft >= node.scrollWidth - node.clientWidth - 2;
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientWidth : 1);
      if (
        (delta < 0 && node.scrollLeft <= 0) ||
        (delta > 0 && node.scrollLeft >= node.scrollWidth - node.clientWidth - 1)
      )
        return;
      event.preventDefault();
      node.scrollLeft += delta;
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(node);
    node.addEventListener("scroll", paint, { passive: true });
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", paint);
      node.removeEventListener("wheel", wheel);
      const active = gesture.current;
      if (active && node.hasPointerCapture(active.id)) node.releasePointerCapture(active.id);
      gesture.current = null;
    };
  }, []);
  function scroll(direction: number) {
    viewport.current?.scrollBy({
      left: viewport.current.clientWidth * 0.78 * direction,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  return (
    <section className="landing-showcase" aria-label={t("landing:showcase")}>
      <div
        ref={viewport}
        className="landing-showcase-scroll"
        tabIndex={0}
        role="group"
        aria-label={t("landing:showcase")}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            !["ArrowLeft", "ArrowRight"].includes(event.key)
          )
            return;
          event.preventDefault();
          scroll(event.key === "ArrowLeft" ? -1 : 1);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0 || !viewport.current) return;
          suppressClick.current = false;
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            left: viewport.current.scrollLeft,
            dragged: false,
          };
        }}
        onPointerMove={(event) => {
          const active = gesture.current,
            node = viewport.current;
          if (!active || active.id !== event.pointerId || !node) return;
          const distance = event.clientX - active.x;
          if (!active.dragged && Math.abs(distance) < 6) return;
          active.dragged = true;
          node.dataset.dragging = "true";
          node.setPointerCapture(event.pointerId);
          event.preventDefault();
          node.scrollLeft = active.left - distance;
        }}
        onPointerUp={(event) => {
          const active = gesture.current;
          if (active?.id !== event.pointerId) return;
          suppressClick.current = active.dragged;
          gesture.current = null;
          delete event.currentTarget.dataset.dragging;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          gesture.current = null;
          suppressClick.current = true;
          delete event.currentTarget.dataset.dragging;
        }}
        onLostPointerCapture={(event) => {
          if (gesture.current) {
            suppressClick.current = true;
            gesture.current = null;
          }
          delete event.currentTarget.dataset.dragging;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {templates.map((template, index) => (
          <Button
            key={template.id}
            variant="ghost"
            className="landing-template-card"
            disabled={busy}
            aria-label={t("templates:use", { name: t(template.nameKey) })}
            onClick={() => onChoose(template.id)}
          >
            <span className="landing-template-stage" data-tone={index % 3}>
              {template.preview &&
              template.mode === "motion" &&
              (template.id === "in-bloom" || template.id === "motion-stress-lab") ? (
                <MotionTemplatePreview
                  templateId={template.id}
                  poster={template.preview}
                  disabled={busy}
                  className="landing-template-motion"
                />
              ) : template.preview ? (
                <img
                  src={template.preview}
                  alt=""
                  loading={index < 2 ? "eager" : "lazy"}
                  draggable={false}
                  width={template.width}
                  height={template.height}
                />
              ) : (
                <span
                  className="landing-template-paper"
                  style={{
                    aspectRatio: `${template.width}/${template.height}`,
                    background: templatePreview(template.id),
                  }}
                >
                  <SocialBrandIcon id={template.brandId ?? ""} size={34} />
                  <span>
                    {template.width} × {template.height}
                  </span>
                </span>
              )}
              <span className="landing-template-open" aria-hidden>
                <ArrowUpRight size={20} />
              </span>
            </span>
            <span className="landing-template-caption">
              <span>{t(template.nameKey)}</span>
              <span>
                <MusArtLogo size={14} />
                MusArt
              </span>
            </span>
          </Button>
        ))}
      </div>
      <div className="landing-showcase-controls">
        <span>{t("landing:showcaseHint")}</span>
        <div>
          <Button
            ref={previous}
            variant="ghost"
            size="icon"
            aria-label={t("landing:previous")}
            onClick={() => scroll(-1)}
          >
            <ArrowLeft size={18} />
          </Button>
          <Button
            ref={next}
            variant="ghost"
            size="icon"
            aria-label={t("landing:next")}
            onClick={() => scroll(1)}
          >
            <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </section>
  );
}
