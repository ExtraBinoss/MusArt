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
    videoOriginalMissing:
      "The original video is missing from local storage. Re-import its source before playing or exporting.",
    videoStorageLimit:
      "The video could not be stored locally. Free storage space or import a smaller source, then retry.",
    videoImportUnavailable:
      "This editor session cannot import video. Reopen a supported session before retrying.",
    videoClosed: "The video source was closed. Reopen the clip or import its source again.",
    videoSuperseded:
      "A newer seek replaced this video request. Wait for the latest frame before retrying.",
    videoAborted: "Video preparation was canceled. Start playback or import again when ready.",
    videoUnsupported:
      "This video cannot be decoded in this browser. Try a browser-supported codec or an SDR copy.",
    videoAlphaUnsupported:
      "Transparent video is not supported yet. Import a version with a background.",
    motionAlphaExportUnsupported:
      "Transparent video export is not supported yet. Choose an opaque export with a background.",
    videoHdrUnsupported:
      "HDR video needs color conversion that this editor does not support yet. Convert the clip to SDR before importing.",
    videoBudgetExceeded:
      "Video preview reached its memory or decoder limit. Reduce active video layers or use a smaller preview source.",
    videoDecodeFailed:
      "A video frame could not be decoded. Reopen the clip; if it persists, re-encode the source or replace a damaged file.",
    videoBusy: "The video decoder is still finishing another request. Wait a moment, then retry.",
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
    videoOriginalMissing:
      "La vidéo originale est absente du stockage local. Réimportez sa source avant la lecture ou l’export.",
    videoStorageLimit:
      "La vidéo n’a pas pu être stockée localement. Libérez de l’espace ou importez une source plus petite, puis réessayez.",
    videoImportUnavailable:
      "Cette session de l’éditeur ne peut pas importer de vidéo. Ouvrez une session compatible avant de réessayer.",
    videoClosed: "La source vidéo a été fermée. Rouvrez le clip ou réimportez sa source.",
    videoSuperseded:
      "Un nouveau déplacement a remplacé cette demande vidéo. Attendez la dernière image avant de réessayer.",
    videoAborted:
      "La préparation vidéo a été annulée. Relancez la lecture ou l’import lorsque vous le souhaitez.",
    videoUnsupported:
      "Ce navigateur ne peut pas décoder cette vidéo. Utilisez un codec compatible avec le navigateur ou une copie SDR.",
    videoAlphaUnsupported:
      "Les vidéos avec transparence ne sont pas encore prises en charge. Importez une version avec un fond.",
    motionAlphaExportUnsupported:
      "L’export vidéo avec transparence n’est pas encore pris en charge. Choisissez un export opaque avec un fond.",
    videoHdrUnsupported:
      "La vidéo HDR nécessite une conversion colorimétrique encore indisponible. Convertissez le clip en SDR avant l’import.",
    videoBudgetExceeded:
      "L’aperçu vidéo a atteint sa limite mémoire ou de décodage. Réduisez les calques vidéo actifs ou la taille de la source d’aperçu.",
    videoDecodeFailed:
      "Une image vidéo n’a pas pu être décodée. Rouvrez le clip ; si le problème persiste, réencodez la source ou remplacez le fichier endommagé.",
    videoBusy: "Le décodeur vidéo termine une autre demande. Patientez un instant, puis réessayez.",
  },
};

registerFeatureTranslations("errors", messages);
