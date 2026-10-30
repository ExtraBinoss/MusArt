import { registerFeatureTranslations } from "../../state/i18n/feature-resources";

export const messages = {
  en: {
    transitionDescription:
      "{{count}} items will be added to the timeline before choosing a transition.",
    transitionTiming: "Existing artwork spans the composition. Its design stays editable.",
    transitionAccept: "Yes, enable Motion",
    transitionCancel: "No, keep Static",
    title: "Bring this composition into Motion?",
    description: "{{count}} items, including the imported video, will be added to the timeline.",
    timing: "Existing artwork spans the composition. Each video keeps its own source duration.",
    groups: "Groups and their child layers are included. Effect and property rows are not counted.",
    preserve: "Your layers stay editable. Switching back to Static preserves the timeline.",
    accept: "Yes, import in Motion",
    cancel: "No, cancel import",
  },
  fr: {
    transitionDescription:
      "{{count}} éléments seront ajoutés à la timeline avant de choisir une transition.",
    transitionTiming: "La composition existante couvre toute la durée. Son dessin reste éditable.",
    transitionAccept: "Oui, activer Motion",
    transitionCancel: "Non, garder statique",
    title: "Passer cette composition en Motion ?",
    description: "{{count}} éléments, dont la vidéo importée, seront ajoutés à la timeline.",
    timing:
      "La composition existante couvre toute la durée. Chaque vidéo garde la durée de sa source.",
    groups:
      "Les groupes et leurs enfants sont inclus. Les lignes d’effets et de propriétés ne sont pas comptées.",
    preserve: "Vos calques restent éditables. Revenir en mode statique conserve la timeline.",
    accept: "Oui, importer en Motion",
    cancel: "Non, annuler l’import",
  },
};
registerFeatureTranslations("motionImport", messages);
