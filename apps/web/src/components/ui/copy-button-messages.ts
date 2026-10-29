import { registerFeatureTranslations } from "../../state/i18n/feature-resources";

export const messages = {
  en: {
    copy: "Copy",
    copying: "Copying…",
    copied: "Copied",
    unavailable: "Clipboard access is unavailable in this browser context.",
    failed: "Copy failed. Allow clipboard access and try again.",
  },
  fr: {
    copy: "Copier",
    copying: "Copie…",
    copied: "Copié",
    unavailable: "Le presse-papiers est indisponible dans ce contexte du navigateur.",
    failed: "La copie a échoué. Autorisez l’accès au presse-papiers et réessayez.",
  },
};
registerFeatureTranslations("copyButton", messages);
