import { brand } from "../config";
import { CompositionPreview } from "./CompositionPreview";
import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import "./messages";
import "./social-card.css";

export function SocialCard() {
  const { i18n } = useTranslation("brandSocial"),
    t = i18n.getFixedT("en", "brandSocial");
  return (
    <main className="brand-social-page">
      <article
        className="brand-social-card"
        data-social-image
        lang="en"
        style={{ "--social-violet": brand.colors.primary } as CSSProperties}
      >
        <img
          className="brand-social-mascot"
          src={`${import.meta.env.BASE_URL}${brand.assets.icon}`}
          alt=""
        />
        <div className="brand-social-wordmark">
          <h1>{brand.name}</h1>
          <span className="brand-social-dot" />
        </div>
        <p className="brand-social-tagline">
          {t("design")}
          <br />
          <span>{t("animate")}</span>
        </p>
        <CompositionPreview />
        <span className="brand-social-domain">
          melt.plinka.eu <span aria-hidden>↗</span>
        </span>
      </article>
    </main>
  );
}
