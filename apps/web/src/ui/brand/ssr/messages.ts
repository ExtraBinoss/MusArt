import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    design: "Design with ease.",
    animate: "Animate to captivate.",
    artwork: "Artist composition with native ASCII and Bayer dither effects",
    failed: "The artwork could not be rendered.",
  },
  fr: {
    design: "Créez en toute simplicité.",
    animate: "Animez pour captiver.",
    artwork: "Composition artistique avec les effets ASCII et dither Bayer natifs",
    failed: "La composition n’a pas pu être rendue.",
  },
};
registerFeatureTranslations("brandSocial", messages);
