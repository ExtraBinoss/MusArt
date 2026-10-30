import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";

export const messages = {
  en: { left: "Scroll {{label}} left", right: "Scroll {{label}} right" },
  fr: {
    left: "Faire défiler {{label}} vers la gauche",
    right: "Faire défiler {{label}} vers la droite",
  },
};
registerFeatureTranslations("scroll", messages);
