import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileImage, Search } from "lucide-react";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { templatePreview } from "./preview";
import "./messages";
import "./templates.css";

export function TemplateGallery({
  onChoose,
  busy = false,
}: {
  onChoose: (templateId: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const templates = TEMPLATE_CATALOG.filter((template) =>
    `${t(template.nameKey)} ${template.brandId ?? ""} ${template.width} ${template.height}`
      .toLocaleLowerCase()
      .includes(term),
  );
  return (
    <section className="template-gallery" aria-busy={busy}>
      <div className="template-search">
        <Search size={15} aria-hidden />
        <Input
          type="search"
          aria-label={t("templates:search")}
          placeholder={t("templates:search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
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
                  <img src={template.preview} alt="" loading="lazy" width={360} height={640} />
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
                <span className="template-title">{name}</span>
                <span className="template-size">
                  {template.width} × {template.height} px
                </span>
                {template.preview && (
                  <span className="template-description">{t("templates:editable")}</span>
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
