import { BrandStatus } from "../../../ui/brand/BrandStatus";
import { brand } from "../../../ui/brand/config";
import { ArrowUpRight, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { Button } from "../../ui/button";
import { HeroHeadline } from "./HeroHeadline";
import { ShowcaseCarousel } from "./ShowcaseCarousel";
import "./messages";
import "./landing.css";

const features = ["canvas", "effects", "motion", "agent"] as const;
/** Video slots remain placeholders until clips are supplied in public/videos. */
export function LandingPage({
  onCreate,
  onTemplate,
  busy = false,
  onCancel,
}: {
  onCreate: () => void;
  onTemplate?: (id: string) => void;
  busy?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("landing");
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a href="#musart-intro" className="landing-brand">
          <MeltLogo size={30} />
          {brand.name}
        </a>
        <Button variant="ghost" disabled={busy} onClick={onCreate}>
          {t("try")}
          <ArrowUpRight size={16} />
        </Button>
      </header>
      <section className="landing-intro" id="musart-intro">
        <HeroHeadline lines={[t("titleFirst"), t("titleSecond")]} />
        <Button className="landing-cta" disabled={busy} onClick={onCreate}>
          {t("create")}
          <ArrowUpRight size={18} />
        </Button>
      </section>
      <ShowcaseCarousel onChoose={onTemplate ?? onCreate} busy={busy} />
      <section className="landing-creativity">
        <h2>{t("creativity")}</h2>
        <p>{t("description")}</p>
        <Button className="landing-cta" disabled={busy} onClick={onCreate}>
          {t("create")}
          <ArrowUpRight size={18} />
        </Button>
      </section>
      <section className="landing-features" aria-label={t("features")}>
        {features.map((feature) => (
          <article className="landing-feature-tile" key={feature} data-feature={feature}>
            <div className="landing-feature-copy">
              <h3>{t(feature)}</h3>
              <p>{t(`${feature}Hint`)}</p>
            </div>
            <div className="landing-video-placeholder" data-video-slot={feature}>
              <span className="landing-video-frame">
                <Play size={22} fill="currentColor" />
                <span>{t("preview")}</span>
              </span>
            </div>
          </article>
        ))}
      </section>
      <footer className="landing-footer">
        <h2>{t("end")}</h2>
        <Button className="landing-cta" disabled={busy} onClick={onCreate}>
          {t("create")}
          <ArrowUpRight size={18} />
        </Button>
        <p>{t("local")}</p>
        <span className="landing-footer-brand">
          <MeltLogo size={26} />
          {brand.name}
        </span>
      </footer>
      {busy && (
        <div className="landing-loading" role="status">
          <BrandStatus size={22} state="preparing" />
          <span>{t("opening")}</span>
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
