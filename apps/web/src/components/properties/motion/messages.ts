import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    add: "Add keyframe · {{property}}",
    update: "Update keyframe · {{property}}",
    armed: "Animated property · {{property}}",
    macro: "This preset changes several parameters. Animate its individual parameters instead.",
    visibility: "Visibility",
  },
  fr: {
    add: "Ajouter une image clé · {{property}}",
    update: "Modifier l’image clé · {{property}}",
    armed: "Propriété animée · {{property}}",
    macro: "Ce préréglage modifie plusieurs paramètres. Animez ses paramètres individuellement.",
    visibility: "Visibilité",
  },
};
registerFeatureTranslations("motionProperties", messages);
