import { registerFeatureTranslations } from "../../../../state/i18n/feature-resources";
export const messages = {
  en: {
    hover: "Hover to preview",
    play: "Play preview",
    pause: "Pause preview",
    loading: "Preparing live preview…",
    failed: "Preview unavailable. You can still open this project.",
    playing: "Live Motion preview",
  },
  fr: {
    hover: "Survolez pour prévisualiser",
    play: "Lire l’aperçu",
    pause: "Mettre l’aperçu en pause",
    loading: "Préparation de l’aperçu…",
    failed: "Aperçu indisponible. Vous pouvez ouvrir ce projet.",
    playing: "Aperçu Motion en direct",
  },
};
registerFeatureTranslations("motionPreview", messages);
