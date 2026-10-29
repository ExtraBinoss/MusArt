import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard, FileImage, LoaderCircle, Search } from "lucide-react";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { SelectField } from "../../shared/SelectField";
import { templatePreview } from "./preview";
import "./messages";
import "./templates.css";

export function TemplateGallery({
  onChoose,
  busy = false,
  onCancel,
}: {
  onChoose: (templateId: string) => void;
  busy?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("all");
  const term = query.trim().toLocaleLowerCase();
  const templates = TEMPLATE_CATALOG.filter(
    (template) =>
      (mode === "all" || template.mode === mode) &&
      `${t(template.nameKey)} ${t(`templates:${template.mode}`)} ${template.brandId ?? ""} ${template.width} ${template.height}`
        .toLocaleLowerCase()
        .includes(term),
  );
  return (
    <section className="template-gallery" aria-busy={busy}>
      <div className="template-toolbar">
        <div className="template-search">
          <Search size={15} aria-hidden />
          <Input
            type="search"
            aria-label={t("templates:search")}
            placeholder={t("templates:search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={busy}
          />
        </div>
        <SelectField
          label={t("templates:filter")}
          value={mode}
          disabled={busy}
          onValueChange={setMode}
          options={[
            { value: "all", label: t("templates:all") },
            { value: "static", label: t("templates:static") },
            { value: "motion", label: t("templates:motion") },
          ]}
          className="template-mode-filter"
        />
      </div>
      {busy && (
        <div className="template-loading" role="status">
          <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
          <span>{t("templates:opening")}</span>
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("templates:cancel")}
            </Button>
          )}
        </div>
      )}
      <div className="template-grid">
        {templates.map((template) => {
          const name = t(template.nameKey);
          return (
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
                style={template.preview ? undefined : { background: templatePreview(template.id) }}
              >
                {template.preview ? (
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
              <div className="template-caption">
                <span className="template-mode" data-mode={template.mode}>
                  {template.mode === "motion" ? (
                    <Clapperboard size={12} aria-hidden />
                  ) : (
                    <FileImage size={12} aria-hidden />
                  )}
                  {t(`templates:${template.mode}`)}
                </span>
                <span className="template-title">{name}</span>
                <span className="template-size">
                  {template.width} × {template.height} px
                </span>
                {template.descriptionKey && (
                  <span className="template-description">{t(template.descriptionKey)}</span>
                )}
              </div>
            </Button>
          );
        })}
      </div>
      {!templates.length && <p className="template-empty">{t("templates:empty")}</p>}
    </section>
  );
}
