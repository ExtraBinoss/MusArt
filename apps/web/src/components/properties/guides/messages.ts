import { i18n } from "../../../state/i18n";
export const messages = {
  en: {
    presets: "Presets",
    color: "Guide color",
    title: "Guide presets",
    description: "Append an editable format frame, centered inside the current target.",
    category: "Format category",
    all: "All",
    social: "Social",
    video: "Video",
    horizontal: "Horizontal",
    vertical: "Vertical",
    addHorizontal: "Add horizontal",
    addVertical: "Add vertical",
    append: "Append {{name}} guides",
  },
  fr: {
    presets: "Modèles",
    color: "Couleur du repère",
    title: "Modèles de repères",
    description: "Ajouter un cadre de format éditable, centré dans la cible actuelle.",
    category: "Catégorie de format",
    all: "Tous",
    social: "Réseaux",
    video: "Vidéo",
    horizontal: "Horizontaux",
    vertical: "Verticaux",
    addHorizontal: "Ajouter horizontal",
    addVertical: "Ajouter vertical",
    append: "Ajouter les repères {{name}}",
  },
};
for (const [language, values] of Object.entries(messages))
  i18n.addResourceBundle(language, "guidePanel", values, true, true);
