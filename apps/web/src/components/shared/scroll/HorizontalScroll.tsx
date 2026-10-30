import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../ui/utils";
import { ScrollShadow } from "./ScrollShadow";
import { installHorizontalScroll } from "./horizontal-scroll";
import "./messages";
import "./horizontal-scroll.css";

/** One native, keyboard-accessible viewport; fades and gestures update imperatively. */
export function HorizontalScroll({
  children,
  label,
  className,
  viewportClassName,
  edgeControls = "arrows",
}: {
  children: ReactNode;
  label: string;
  className?: string;
  viewportClassName?: string;
  edgeControls?: "arrows" | "shadows";
}) {
  const root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const { t } = useTranslation("scroll");
  useEffect(
    () =>
      root.current && viewport.current
        ? installHorizontalScroll(root.current, viewport.current)
        : undefined,
    [edgeControls],
  );
  return (
    <div
      className={cn("horizontal-scroll", className)}
      ref={root}
      data-scroll-controls={edgeControls}
    >
      <ScrollShadow axis="horizontal" className="horizontal-scroll-shadow">
        <div
          ref={viewport}
          className={cn("horizontal-scroll-viewport", viewportClassName)}
          role="group"
          aria-label={label}
          tabIndex={0}
        >
          <div className="horizontal-scroll-content">{children}</div>
        </div>
      </ScrollShadow>
      {edgeControls === "arrows" && (
        <>
          <button
            type="button"
            className="horizontal-scroll-arrow is-left"
            data-horizontal-direction="-1"
            aria-label={t("left", { label })}
            disabled
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="horizontal-scroll-arrow is-right"
            data-horizontal-direction="1"
            aria-label={t("right", { label })}
            disabled
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
