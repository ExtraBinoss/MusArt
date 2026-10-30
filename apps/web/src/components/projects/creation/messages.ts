import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  fr: {
    title: "Un nouvel espace pour vos idées.",
    hint: "Un nom, un format. Et c’est parti.",
    format: "Choisir un format",
    custom: "Personnalisé",
    social: "Social",
    video: "Vidéo",
    print: "Print",
    screen: "Écran",
    link: "Lier les proportions",
    unlink: "Délier les proportions",
    preview: "Aperçu du format",
    ready: "Votre prochaine idée, ici.",
    size: "{{width}} × {{height}} px",
  },
  en: {
    title: "A fresh space for your ideas.",
    hint: "A name, a size. You’re ready to go.",
    format: "Choose a format",
    custom: "Custom",
    social: "Social",
    video: "Video",
    print: "Print",
    screen: "Screen",
    link: "Lock aspect ratio",
    unlink: "Unlock aspect ratio",
    preview: "Canvas preview",
    ready: "Your next idea goes here.",
    size: "{{width}} × {{height}} px",
  },
};
registerFeatureTranslations("creation", messages);
