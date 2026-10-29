import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
export const messages = {
  en: {
    close: "Dismiss notification",
    copy: "Copy message and diagnostics",
    details: "Technical details",
  },
  fr: {
    close: "Fermer la notification",
    copy: "Copier le message et le diagnostic",
    details: "Détails techniques",
  },
};
registerFeatureTranslations("notices", messages);
