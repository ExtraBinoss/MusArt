import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { installHoverScroll } from "./hover-scroll";
import "./messages";

/** Keeps the genuine toolbar viewport inside the shared shadow decoration. */
export function ToolbarScroll({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const { t } = useTranslation("dock");
  useEffect(
    () =>
      root.current && viewport.current
        ? installHoverScroll(root.current, viewport.current)
        : undefined,
    [],
  );
  return (
    <div className="toolbar-scroll-shell" ref={root}>
      <ScrollShadow className="toolbar-scroll" surface="var(--popover)">
        <div ref={viewport} className="toolbar-contents" data-dock-scroll>
          {children}
        </div>
      </ScrollShadow>
      <button
        type="button"
        className="toolbar-scroll-arrow toolbar-scroll-up"
        data-scroll-direction="-1"
        aria-label={t("scrollUp")}
        disabled
      >
        <ChevronUp size={13} aria-hidden />
      </button>
      <button
        type="button"
        className="toolbar-scroll-arrow toolbar-scroll-down"
        data-scroll-direction="1"
        aria-label={t("scrollDown")}
        disabled
      >
        <ChevronDown size={13} aria-hidden />
      </button>
    </div>
  );
}
