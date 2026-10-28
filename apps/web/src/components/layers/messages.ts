import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
export const messages = {
  en: {
    mixed: "Mixed",
    deleteSelection: "Delete selection ({{count}})",
    compositing: "Layer compositing",
    alignParent: "Align to group",
    alignSelection: "Align to selection",
    alignPage: "Align to artboard",
  },
  fr: {
    mixed: "Mixte",
    deleteSelection: "Supprimer la sélection ({{count}})",
    compositing: "Composition des calques",
    alignParent: "Aligner dans le groupe",
    alignSelection: "Aligner dans la sélection",
    alignPage: "Aligner dans le plan de travail",
  },
};
registerFeatureTranslations("layerControls", messages);
