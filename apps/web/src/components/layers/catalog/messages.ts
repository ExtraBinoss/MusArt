import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    search: "Search effects",
    searchAdjustment: "Search adjustments",
    familyLabel: "Category",
    all: "All categories",
    empty: "No matching effects",
    emptyAdjustment: "No matching adjustments",
    family: {
      tone: "Light & tone",
      color: "Color",
      texture: "Texture & print",
      distortion: "Distortion",
      light: "Lighting & focus",
      blur: "Blur",
      retro: "Retro & screens",
      motion: "Motion & transitions",
    },
  },
  fr: {
    search: "Rechercher un effet",
    searchAdjustment: "Rechercher un réglage",
    familyLabel: "Catégorie",
    all: "Toutes les catégories",
    empty: "Aucun effet correspondant",
    emptyAdjustment: "Aucun réglage correspondant",
    family: {
      tone: "Lumière et tonalité",
      color: "Couleur",
      texture: "Texture et impression",
      distortion: "Déformation",
      light: "Éclairage et mise au point",
      blur: "Flou",
      retro: "Rétro et écrans",
      motion: "Mouvement et transitions",
    },
  },
};
registerFeatureTranslations("effectCatalog", messages);
