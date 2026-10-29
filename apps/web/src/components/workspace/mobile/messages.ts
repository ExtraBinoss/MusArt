import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  fr: {
    navigation: "Outils de l’éditeur",
    properties: "Propriétés",
    layers: "Calques",
    motion: "Motion",
    tools: "Outils",
    export: "Exporter",
    close: "Fermer le panneau",
    dismiss: "Glisser vers le bas pour fermer",
    slider: "Régler {{label}}",
    motionHint: "Passez en Motion pour animer votre création.",
    enableMotion: "Passer en mode Motion",
    precision: "Valeur précise : {{label}}",
  },
  en: {
    navigation: "Editor tools",
    properties: "Properties",
    layers: "Layers",
    motion: "Motion",
    tools: "Tools",
    export: "Export",
    close: "Close panel",
    dismiss: "Drag down to close",
    slider: "Adjust {{label}}",
    motionHint: "Switch to Motion to animate your creation.",
    enableMotion: "Switch to Motion",
    precision: "Precise value: {{label}}",
  },
};
registerFeatureTranslations("mobile", messages);
