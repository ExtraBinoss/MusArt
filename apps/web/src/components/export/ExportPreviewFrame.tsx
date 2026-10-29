import { useCallback, useState } from "react";
import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../shared/IconButton";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";

interface PreviewBox {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  dpr: number;
}
function layout(box: PreviewBox | null, width: number, height: number, expanded: boolean) {
  if (!box || width <= 0 || height <= 0) return null;
  const fit = Math.min(4, (box.width - box.paddingX) / width, (box.height - box.paddingY) / height);
  if (fit <= 0) return null;
  const pixels = Math.max(
      1,
      Math.min(
        768,
        // ThumbnailRenderer and RenderOptions both cap raster density at 8×.
        Math.floor(Math.max(width, height) * 8),
        Math.floor(Math.max(width, height) * fit * (expanded ? 2 : 1) * box.dpr),
      ),
    ),
    scale = pixels / (Math.max(width, height) * box.dpr);
  return {
    width: width * scale,
    height: height * scale,
    edge: Math.max(16, pixels),
  };
}
export function ExportPreviewFrame({
  url,
  loading,
  width,
  height,
  format,
  onResolution,
}: {
  url: string | null;
  loading: boolean;
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
  onResolution?: (edge: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [box, setBox] = useState<PreviewBox | null>(null);
  const viewport = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      let active = true;
      const measure = () => {
        if (!active) return;
        const body = element.firstElementChild;
        if (!(body instanceof HTMLElement)) return;
        const style = getComputedStyle(body),
          padding = (value: string) => Number.parseFloat(value) || 0,
          next = {
            width: element.clientWidth,
            height: element.clientHeight,
            paddingX: padding(style.paddingLeft) + padding(style.paddingRight),
            paddingY: padding(style.paddingTop) + padding(style.paddingBottom),
            dpr: window.devicePixelRatio || 1,
          };
        setBox((previous) =>
          previous &&
          Object.keys(next).every(
            (key) => next[key as keyof PreviewBox] === previous[key as keyof PreviewBox],
          )
            ? previous
            : next,
        );
        const size = layout(next, width, height, expanded);
        if (size) onResolution?.(size.edge);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      window.addEventListener("resize", measure);
      measure();
      return () => {
        active = false;
        observer.disconnect();
        window.removeEventListener("resize", measure);
      };
    },
    [width, height, expanded, onResolution],
  );
  const size = layout(box, width, height, expanded);
  return (
    <div className="export-preview-wrap">
      <ScrollShadow className="export-preview-shadow">
        <div className="export-preview" aria-label={t("exportPanel:preview")} ref={viewport}>
          <div
            className="export-preview-body"
            data-expanded={expanded}
            style={
              box && size
                ? {
                    width: Math.max(box.width, size.width + box.paddingX),
                    height: Math.max(box.height, size.height + box.paddingY),
                  }
                : undefined
            }
          >
            {url ? (
              <img
                src={url}
                alt={t("exportPanel:preview")}
                data-format={format}
                style={size ? { width: size.width, height: size.height } : undefined}
              />
            ) : (
              <span role="status">
                {loading && <LoaderCircle size={18} className="animate-spin" />}
                {t(loading ? "exportPanel:preparing" : "exportPanel:failed")}
              </span>
            )}
          </div>
        </div>
      </ScrollShadow>
      {(url || expanded) && (
        <IconButton
          className="export-preview-zoom floating-panel"
          label={t(expanded ? "exportPanel:fit" : "exportPanel:zoom")}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
        </IconButton>
      )}
    </div>
  );
}
