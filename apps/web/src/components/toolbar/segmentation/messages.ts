import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    megabytes: "{{value}} MB",
    downloading: "Downloading the local model…",
    initializing: "Initializing the local model…",
    downloadProgress: "Model download",
    progress: "{{loaded}} of {{total}}, {{percent}} percent",
    loadCached: "Load local model",
    cached: "On this device · {{size}}",
    remove: "Remove downloaded model",
    removing: "Removing…",
    localHint: "Runs on your device. Your images are never uploaded.",
    unavailable: "Browser storage is unavailable. This session can still load the model.",
    inspectError: "The downloaded model could not be inspected.",
    prepareError: "The model operation failed. Please try again.",
  },
  fr: {
    megabytes: "{{value}} Mo",
    downloading: "Téléchargement du modèle local…",
    initializing: "Initialisation du modèle local…",
    downloadProgress: "Téléchargement du modèle",
    progress: "{{loaded}} sur {{total}}, {{percent}} pour cent",
    loadCached: "Charger le modèle local",
    cached: "Sur cet appareil · {{size}}",
    remove: "Supprimer le modèle téléchargé",
    removing: "Suppression…",
    localHint: "Fonctionne sur votre appareil. Vos images ne sont jamais envoyées.",
    unavailable:
      "Le stockage du navigateur est indisponible. Le modèle reste utilisable dans cette session.",
    inspectError: "Impossible de vérifier le modèle téléchargé.",
    prepareError: "L’opération sur le modèle a échoué. Réessayez.",
  },
};
registerFeatureTranslations("localModel", messages);
