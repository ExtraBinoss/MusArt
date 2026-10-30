import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";

export const messages = {
  en: {
    navigation: "Studio navigation",
    projects: "Projects",
    templates: "Templates",
    community: "Community",
    soon: "Soon",
    recent: "Recent projects",
    openRecent: "Open recent project {{name}}",
    empty: "Your next projects will appear here.",
    loading: "Loading recent projects…",
    unavailable: "Recent projects are unavailable.",
    previewUnavailable: "Project preview is unavailable.",
    retry: "Try again",
    preferences: "Preferences",
  },
  fr: {
    navigation: "Navigation de l’atelier",
    projects: "Projets",
    templates: "Templates",
    community: "Communauté",
    soon: "Bientôt",
    recent: "Projets récents",
    openRecent: "Ouvrir le projet récent {{name}}",
    empty: "Vos prochains projets apparaîtront ici.",
    loading: "Chargement des projets récents…",
    unavailable: "Les projets récents sont indisponibles.",
    previewUnavailable: "L’aperçu du projet est indisponible.",
    retry: "Réessayer",
    preferences: "Préférences",
  },
};
registerFeatureTranslations("library", messages);
