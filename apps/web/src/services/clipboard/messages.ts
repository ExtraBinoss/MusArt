import { brand } from "../../ui/brand/config";
import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
export const messages = {
  en: {
    unavailable:
      "Clipboard access is unavailable. Use the browser’s Copy or Paste command while the canvas is focused.",
    readFailed:
      "The clipboard could not be read. Allow clipboard access or use your browser’s Paste command.",
    writeFailed: "The selection could not be copied to the clipboard.",
    invalid: `This clipboard content is not a supported ${brand.name} document.`,
    missingImages:
      "The original images are unavailable in this project. Copy again with Include images enabled in General settings.",
    tooLarge:
      "This selection exceeds the 32 MiB clipboard limit. Copy fewer items or exclude images in General settings.",
    stale: "The composition changed while reading the clipboard. Paste again.",
    empty: "Select at least one item to copy, or use Copy composition.",
  },
  fr: {
    unavailable:
      "Le presse-papiers est indisponible. Utilisez Copier ou Coller dans le navigateur lorsque le canvas est actif.",
    readFailed:
      "Impossible de lire le presse-papiers. Autorisez son accès ou utilisez la commande Coller du navigateur.",
    writeFailed: "Impossible de copier la sélection dans le presse-papiers.",
    invalid: `Le contenu du presse-papiers n’est pas un document ${brand.name} pris en charge.`,
    missingImages:
      "Les images originales sont absentes de ce projet. Recopiez avec Inclure les images activé dans Général.",
    tooLarge:
      "Cette sélection dépasse la limite de 32 Mio du presse-papiers. Copiez moins d’éléments ou excluez les images dans Général.",
    stale: "La composition a changé pendant la lecture du presse-papiers. Collez à nouveau.",
    empty: "Sélectionnez un élément à copier ou utilisez Copier la composition.",
  },
};
registerFeatureTranslations("clipboard", messages);
