import { registerFeatureTranslations } from "../state/i18n/feature-resources";
export const messages = {
  en: { opening: "Opening your studio…", dismiss: "Dismiss message" },
  fr: { opening: "Ouverture de votre atelier…", dismiss: "Fermer le message" },
};
registerFeatureTranslations("startup", messages);
