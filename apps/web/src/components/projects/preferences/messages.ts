import { brand } from "../../../ui/brand/config";
import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    clipboardImages: "Include images when copying",
    clipboardImagesDescription:
      "Embed original images so copied items can be pasted into another project or shared. Turn off for references within this project only.",
    categories: "Preferences categories",
    general: "General",
    appearance: "Appearance",
    shortcuts: "Shortcuts",
    editor: "Editor",
    generalDescription: "Choose your workspace language and clipboard behavior.",
    appearanceDescription: `Make ${brand.name} comfortable in your environment.`,
    shortcutsDescription: "Edit actual application shortcuts. Changes are saved on this device.",
    editorDescription: "Adjust the way objects respond while you work.",
    languageDescription: "Menus, tools and messages use your selected language.",
    themeDescription: "Follow your device or choose a light or dark workspace.",
    snapEnabled: "Snap to elements",
    snapDescription: "Align moving and resized objects to other elements and their artboard.",
    snapDistance: "Snapping distance",
    snapDistanceDescription:
      "Measured in screen pixels so the attraction feels consistent at any zoom.",
    trySnap: "Try snapping",
    tryClose: "Close preview",
    tryDescription:
      "Drag the object near the reference. Hold Alt to bypass snapping; arrow keys move it, and Shift increases the step.",
    tryCanvas: "Snapping preview",
    tryObject: "Movable preview object",
    tryReset: "Reset preview",
  },
  fr: {
    clipboardImages: "Inclure les images à la copie",
    clipboardImagesDescription:
      "Intégrez les images originales pour coller dans un autre projet ou partager les éléments. Désactivez pour des références limitées à ce projet.",
    categories: "Catégories des préférences",
    general: "Général",
    appearance: "Apparence",
    shortcuts: "Raccourcis",
    editor: "Éditeur",
    generalDescription: "Choisissez la langue et le comportement du presse-papiers.",
    appearanceDescription: `Adaptez ${brand.name} à votre environnement.`,
    shortcutsDescription:
      "Modifiez les vrais raccourcis de l’application. Ils sont enregistrés sur cet appareil.",
    editorDescription: "Réglez le comportement des objets pendant votre travail.",
    languageDescription: "Les menus, outils et messages utilisent la langue choisie.",
    themeDescription: "Suivez votre appareil ou choisissez un espace clair ou sombre.",
    snapEnabled: "Accrocher aux éléments",
    snapDescription:
      "Alignez les objets déplacés ou redimensionnés sur les autres éléments et leur plan de travail.",
    snapDistance: "Distance d’accrochage",
    snapDistanceDescription:
      "Mesurée en pixels à l’écran, pour une attraction constante à chaque niveau de zoom.",
    trySnap: "Essayer le magnétisme",
    tryClose: "Fermer l’essai",
    tryDescription:
      "Faites glisser l’objet près du repère. Maintenez Alt pour ignorer l’accrochage ; les flèches déplacent l’objet et Maj augmente le pas.",
    tryCanvas: "Aperçu de l’accrochage",
    tryObject: "Objet à déplacer",
    tryReset: "Recommencer",
  },
};
registerFeatureTranslations("preferences", messages);
