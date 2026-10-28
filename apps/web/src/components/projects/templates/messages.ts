import { i18n } from "../../../state/i18n";

const resources = {
  en: {
    afterhours: "AFTERHOURS — Techno",
    search: "Search templates",
    use: "Create from {{name}}",
    editable: "150 editable layers · Music poster",
    blank: "Blank canvas",
    empty: "No matching templates.",
  },
  fr: {
    afterhours: "AFTERHOURS — Techno",
    search: "Rechercher un modèle",
    use: "Créer depuis {{name}}",
    editable: "150 calques éditables · Affiche musicale",
    blank: "Plan de travail vierge",
    empty: "Aucun modèle correspondant.",
  },
};
for (const [language, values] of Object.entries(resources))
  i18n.addResourceBundle(language, "templates", values, true, true);
