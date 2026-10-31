import { registerFeatureTranslations } from "../state/i18n/feature-resources";
export const messages = {
  en: {
    navigation: "Main navigation",
    dashboard: "Dashboard",
    editor: "Open editor",
    home: "Home",
  },
  fr: {
    navigation: "Navigation principale",
    dashboard: "Mes projets",
    editor: "Ouvrir l’éditeur",
    home: "Accueil",
  },
};
registerFeatureTranslations("routing", messages);
