import { useState } from "react";
import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../shared/IconButton";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
export function ExportPreviewFrame({
  url,
  loading,
  width,
  height,
  format,
}: {
  url: string | null;
  loading: boolean;
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="export-preview-wrap">
      <ScrollShadow className="export-preview-shadow">
        <div className="export-preview" aria-label={t("exportPanel:preview")}>
          <div
            className="export-preview-body"
            data-expanded={expanded}
            style={expanded ? { width: width * 2 + 28, height: height * 2 + 28 } : undefined}
          >
            {url ? (
              <img
                src={url}
                alt={t("exportPanel:preview")}
                data-format={format}
                style={expanded ? { width: width * 2, height: height * 2 } : undefined}
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
      {url && (
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
