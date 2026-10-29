import { i18n } from "../../../state/i18n";

const resources = {
  en: {
    afterhours: "AFTERHOURS — Techno",
    bloom: "In Bloom — Motion showcase",
    stress: "Motion stress lab",
    bloomDescription: "5 s · Video, photo collages, springs and live effects",
    stressDescription: "50 photo layers · 100 effects · 3 video clips",
    filter: "Template mode",
    all: "All templates",
    static: "Static",
    motion: "Motion",
    search: "Search templates",
    use: "Create from {{name}}",
    editable: "150 editable layers · Music poster",
    blank: "Blank canvas",
    empty: "No matching templates.",
    opening: "Preparing template…",
    cancel: "Cancel",
  },
  fr: {
    afterhours: "AFTERHOURS — Techno",
    bloom: "In Bloom — Démo Motion",
    stress: "Laboratoire Motion",
    bloomDescription: "5 s · Vidéo, collages photo, ressorts et effets animés",
    stressDescription: "50 calques photo · 100 effets · 3 clips vidéo",
    filter: "Mode du modèle",
    all: "Tous les modèles",
    static: "Statique",
    motion: "Motion",
    search: "Rechercher un modèle",
    use: "Créer depuis {{name}}",
    editable: "150 calques éditables · Affiche musicale",
    blank: "Plan de travail vierge",
    empty: "Aucun modèle correspondant.",
    opening: "Préparation du modèle…",
    cancel: "Annuler",
  },
};
for (const [language, values] of Object.entries(resources))
  i18n.addResourceBundle(language, "templates", values, true, true);
