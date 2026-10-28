import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
export const messages = {
  en: {
    selection: "Selection · {{count}} layer(s)",
    artboard: "Artboard · {{name}}",
    whole: "Whole artboard",
    allArtboards: "All artboards (.zip)",
    preview: "Export preview",
    preparing: "Preparing preview…",
    failed: "Preview unavailable",
    exportFailed: "Export failed. Try again.",
    stale: "The export target changed. Open the export popover again.",
    previewHint: "The exported file uses the selected resolution.",
    fit: "Fit preview",
    zoom: "Zoom preview",
  },
  fr: {
    selection: "Sélection · {{count}} calque(s)",
    artboard: "Plan de travail · {{name}}",
    whole: "Plan de travail entier",
    allArtboards: "Tous les plans de travail (.zip)",
    preview: "Aperçu de l’export",
    preparing: "Préparation de l’aperçu…",
    failed: "Aperçu indisponible",
    exportFailed: "L’export a échoué. Réessayez.",
    stale: "La cible de l’export a changé. Ouvrez à nouveau le panneau d’export.",
    previewHint: "Le fichier exporté utilise la résolution choisie.",
    fit: "Ajuster l’aperçu",
    zoom: "Agrandir l’aperçu",
  },
};
registerFeatureTranslations("exportPanel", messages);
