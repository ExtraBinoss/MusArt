import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
export const messages = {
  en: {
    center: "Effect center",
    radius: "Effect radius",
    innerRadius: "Protected radius",
    hint: "Drag the center or radius · Escape to cancel",
  },
  fr: {
    center: "Centre de l’effet",
    radius: "Rayon de l’effet",
    innerRadius: "Rayon protégé",
    hint: "Déplacez le centre ou le rayon · Échap pour annuler",
  },
};
registerFeatureTranslations("effectGizmo", messages);
