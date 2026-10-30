import { brand } from "../../../ui/brand/config";
import { useLayoutEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { Button } from "../../ui/button";
import { templatePreview } from "../templates/preview";
import { MotionTemplatePreview } from "../templates/motion-preview/MotionTemplatePreview";
import "../templates/messages";
import "./messages";
import "./motion-showcase.css";
import { installCarouselPan } from "./carousel/controller";

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
  const position = useRef(0);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const pan = installCarouselPan(node, {
      reducedMotion: reduced === true,
      position: position.current,
    });
    return () => {
      position.current = pan.position();
      pan.dispose();
    };
  }, [reduced]);
  return (
    <section className="landing-showcase" aria-label={t("landing:showcase")}>
      <div
        ref={viewport}
        className="landing-showcase-scroll"
        tabIndex={0}
        role="group"
        aria-label={t("landing:showcase")}
        aria-description={t("landing:showcaseHint")}
        data-carousel
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
                <MeltLogo size={14} />
                {brand.name}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
