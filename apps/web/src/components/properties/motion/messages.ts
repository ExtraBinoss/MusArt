import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    add: "Add keyframe · {{property}}",
    update: "Update keyframe · {{property}}",
    armed: "Animated property · {{property}}",
    macro: "This preset changes several parameters. Animate its individual parameters instead.",
    inactive: "Move the playhead inside this layer's clip to edit its properties.",
    visibility: "Visibility",
  },
  fr: {
    add: "Ajouter une image clé · {{property}}",
    update: "Modifier l’image clé · {{property}}",
    armed: "Propriété animée · {{property}}",
    macro: "Ce préréglage modifie plusieurs paramètres. Animez ses paramètres individuellement.",
    inactive: "Placez la tête de lecture dans un clip de ce calque pour modifier ses propriétés.",
    visibility: "Visibilité",
  },
};
registerFeatureTranslations("motionProperties", messages);
