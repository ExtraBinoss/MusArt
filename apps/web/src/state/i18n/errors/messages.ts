import { registerFeatureTranslations } from "../feature-resources";

export const messages = {
  en: {
    gpuUnavailable: "GPU rendering is unavailable. Reload to try again.",
    gpuError: "GPU rendering unavailable: {{message}}",
    staleProjectWrite: "This project changed while saving. Reload it before retrying your changes.",
    uncertainJournalInitialization:
      "History initialization could not be confirmed. Check the current project before retrying.",
    uncertainProjectWrite:
      "Saving could not be confirmed. Check the saved project before retrying.",
    journalQueueFull: "History has too many pending writes. Wait for it to finish, then retry.",
    pixelSelectionTooLarge:
      "This image is too large for pixel selection. Resize it before retrying.",
    pixelSelectionImageRequired: "Select an unlocked image to create a pixel selection.",
  },
  fr: {
    gpuUnavailable: "Le rendu GPU est indisponible. Rechargez pour réessayer.",
    gpuError: "Rendu GPU indisponible : {{message}}",
    staleProjectWrite:
      "Ce projet a changé pendant l’enregistrement. Rechargez-le avant de réessayer vos modifications.",
    uncertainJournalInitialization:
      "L’initialisation de l’historique n’a pas pu être confirmée. Vérifiez le projet actuel avant de réessayer.",
    uncertainProjectWrite:
      "L’enregistrement n’a pas pu être confirmé. Vérifiez le projet sauvegardé avant de réessayer.",
    journalQueueFull:
      "Trop d’écritures d’historique sont en attente. Attendez la fin, puis réessayez.",
    pixelSelectionTooLarge:
      "Cette image est trop grande pour la sélection de pixels. Redimensionnez-la avant de réessayer.",
    pixelSelectionImageRequired:
      "Sélectionnez une image déverrouillée pour créer une sélection de pixels.",
  },
};

registerFeatureTranslations("errors", messages);
