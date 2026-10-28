import { registerFeatureTranslations } from "../feature-resources";

export const messages = {
  en: {
    gpuUnavailable: "GPU rendering is unavailable. Reload to try again.",
    gpuError: "GPU rendering unavailable: {{message}}",
    staleProjectWrite: "This project changed while saving. Reload it before retrying your changes.",
  },
  fr: {
    gpuUnavailable: "Le rendu GPU est indisponible. Rechargez pour réessayer.",
    gpuError: "Rendu GPU indisponible : {{message}}",
    staleProjectWrite:
      "Ce projet a changé pendant l’enregistrement. Rechargez-le avant de réessayer vos modifications.",
  },
};

registerFeatureTranslations("errors", messages);
