import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";

export const messages = {
  en: {
    type: "Fill type",
    solid: "Solid",
    gradient: "Gradient",
    gradientType: "Gradient type",
    linear: "Linear",
    radial: "Radial",
    angleLabel: "Angle",
    angle: "Gradient angle",
    stops: "Stops",
    stop: "Stop {{number}}",
    stopPosition: "Stop {{number}} position",
    stopColor: "Stop {{number}} color",
    stopHex: "Stop {{number}} hex color",
    stopOpacity: "Stop {{number}} opacity",
    add: "Add color stop",
    removeStop: "Remove stop {{number}}",
    preview: "Gradient preview",
  },
  fr: {
    type: "Type de remplissage",
    solid: "Uni",
    gradient: "Dégradé",
    gradientType: "Type de dégradé",
    linear: "Linéaire",
    radial: "Radial",
    angleLabel: "Angle",
    angle: "Angle du dégradé",
    stops: "Points",
    stop: "Point {{number}}",
    stopPosition: "Position du point {{number}}",
    stopColor: "Couleur du point {{number}}",
    stopHex: "Couleur hexadécimale du point {{number}}",
    stopOpacity: "Opacité du point {{number}}",
    add: "Ajouter un point de couleur",
    removeStop: "Supprimer le point {{number}}",
    preview: "Aperçu du dégradé",
  },
};

registerFeatureTranslations("gradient", messages);
