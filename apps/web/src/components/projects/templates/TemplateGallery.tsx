import { BrandStatus } from "../../../ui/brand/BrandStatus";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { FileImage } from "lucide-react";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { Button } from "../../ui/button";
import { SearchInput } from "../../assets/SearchInput";
import { ModeIcon } from "../../motion/ModeIcon";
import { LibraryModeFilter } from "../dashboard/LibraryModeFilter";
import { useLibraryMode, type LibraryMode } from "../dashboard/library-mode";
import { templatePreview } from "./preview";
import { MotionTemplatePreview } from "./motion-preview/MotionTemplatePreview";
import "./messages";
import "./templates.css";

export function TemplateGallery({
  onChoose,
  busy = false,
  onCancel,
  query: externalQuery,
  mode: externalMode,
  hideToolbar = false,
  onQueryChange,
  onModeChange,
}: {
  onChoose: (templateId: string) => void;
  busy?: boolean;
  onCancel?: () => void;
  query?: string;
  mode?: LibraryMode;
  hideToolbar?: boolean;
  onQueryChange?: (query: string) => void;
  onModeChange?: (mode: LibraryMode) => void;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [localQuery, setLocalQuery] = useState("");
  const [localMode, setLocalMode] = useLibraryMode();
  const query = externalQuery ?? localQuery;
  const mode = externalMode ?? localMode;
  const term = query.trim().toLocaleLowerCase();
  const modeTemplates = TEMPLATE_CATALOG.filter(
    (template) => mode === "all" || template.mode === mode,
  );
  const templates = modeTemplates.filter((template) =>
    `${t(template.nameKey)} ${t(`templates:${template.mode}`)} ${template.brandId ?? ""} ${template.width} ${template.height}`
      .toLocaleLowerCase()
      .includes(term),
  );
  return (
    <section className="template-gallery" aria-busy={busy}>
      {!hideToolbar && (
        <div className="template-toolbar">
          <div className="template-search">
            <SearchInput
              aria-label={t("templates:search")}
              hints={modeTemplates.slice(0, 6).map((item) => ({
                label: t(item.nameKey),
                preview: item.preview ? (
                  <img src={item.preview} alt="" />
                ) : (
                  <SocialBrandIcon id={item.brandId ?? ""} size={20} />
                ),
              }))}
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                if (externalQuery === undefined) setLocalQuery(next);
                onQueryChange?.(next);
              }}
              disabled={busy}
            />
          </div>
          <LibraryModeFilter
            value={mode}
            disabled={busy}
            onChange={(value) => {
              if (externalMode === undefined) setLocalMode(value);
              onModeChange?.(value);
            }}
          />
        </div>
      )}
      {busy && (
        <div className="template-loading" role="status">
          <BrandStatus size={22} state="preparing" />
          <span>{t("templates:opening")}</span>
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("templates:cancel")}
            </Button>
          )}
        </div>
      )}
      <div className="template-grid">
        {templates.map((template, index) => {
          const name = t(template.nameKey);
          return (
            <motion.div
              key={template.id}
              className="template-card-entry"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduced ? 0 : 0.18,
                delay: reduced ? 0 : Math.min(index * 0.025, 0.15),
              }}
            >
              <Button
                key={template.id}
                variant="ghost"
                className="template-card"
                disabled={busy}
                aria-label={t("templates:use", { name })}
                onClick={() => onChoose(template.id)}
              >
                <div
                  className="template-artwork"
                  data-artwork={Boolean(template.preview)}
                  style={
                    template.preview ? undefined : { background: templatePreview(template.id) }
                  }
                >
                  {template.preview &&
                  template.mode === "motion" &&
                  (template.id === "in-bloom" ||
                    template.id === "motion-stress-lab" ||
                    template.id === "share-your-work") ? (
                    <MotionTemplatePreview
                      templateId={template.id}
                      poster={template.preview}
                      disabled={busy}
                    />
                  ) : template.preview ? (
                    <img
                      src={template.preview}
                      alt=""
                      loading="lazy"
                      width={template.width}
                      height={template.height}
                    />
                  ) : (
                    <div
                      className="template-paper"
                      style={{
                        aspectRatio: `${template.width} / ${template.height}`,
                        width: template.width >= template.height ? "76%" : "auto",
                        height: template.width >= template.height ? "auto" : "76%",
                      }}
                    >
                      {["instagram", "tiktok", "youtube", "linkedin"].includes(
                        template.brandId ?? "",
                      ) ? (
                        <SocialBrandIcon id={template.brandId!} size={28} />
                      ) : (
                        <FileImage size={28} strokeWidth={1.1} aria-hidden />
                      )}
                    </div>
                  )}
                </div>
                <div className="template-caption project-card-overlay">
                  <span className="template-meta">
                    <span className="template-title">{name}</span>
                    <span className="template-size">
                      {template.width} × {template.height} px
                    </span>
                  </span>
                  <span className="template-mode" data-mode={template.mode}>
                    <ModeIcon mode={template.mode} size={14} />
                    <span>{t(`templates:${template.mode}`)}</span>
                  </span>
                </div>
              </Button>
            </motion.div>
          );
        })}
      </div>
      {!templates.length && <p className="template-empty">{t("templates:empty")}</p>}
    </section>
  );
}
