import { registerFeatureTranslations } from "../../../../state/i18n/feature-resources";
export const messages = {
  en: {
    loading: "Preparing live preview…",
    failed: "Preview unavailable. You can still open this template.",
    playing: "Live Motion preview",
  },
  fr: {
    loading: "Préparation de l’aperçu…",
    failed: "Aperçu indisponible. Vous pouvez ouvrir ce modèle.",
    playing: "Aperçu Motion en direct",
  },
};
registerFeatureTranslations("motionPreview", messages);
