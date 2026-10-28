import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";

export const messages = {
  en: {
    type: "Fill type",
    solid: "Solid",
    linear: "Linear gradient",
    radial: "Radial gradient",
    angle: "Gradient angle",
    position: "Stop position",
    stop: "Stop {{number}}",
    stopColor: "Stop {{number}} color",
    add: "Add color stop",
    remove: "Remove selected stop",
    preview: "Gradient preview",
    endpoints: "The first and last stops stay at 0% and 100%.",
  },
  fr: {
    type: "Type de remplissage",
    solid: "Uni",
    linear: "Dégradé linéaire",
    radial: "Dégradé radial",
    angle: "Angle du dégradé",
    position: "Position du point",
    stop: "Point {{number}}",
    stopColor: "Couleur du point {{number}}",
    add: "Ajouter un point de couleur",
    remove: "Supprimer le point sélectionné",
    preview: "Aperçu du dégradé",
    endpoints: "Le premier et le dernier point restent à 0 % et 100 %.",
  },
};

registerFeatureTranslations("gradient", messages);
