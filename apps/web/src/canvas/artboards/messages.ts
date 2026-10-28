import { registerFeatureTranslations } from "../../state/i18n/feature-resources";

registerFeatureTranslations("artboards", {
  en: {
    activate: "Edit {{name}}",
    options: "Artboard options: {{name}}",
    optionsHint: "Artboard options",
    rename: "Rename",
    remove: "Delete",
    name: "Artboard name",
    preparing: "Preparing preview",
    unavailable: "Preview unavailable · click to edit",
    retry: "Retry previews",
  },
  fr: {
    activate: "Modifier {{name}}",
    options: "Options du plan de travail : {{name}}",
    optionsHint: "Options du plan de travail",
    rename: "Renommer",
    remove: "Supprimer",
    name: "Nom du plan de travail",
    preparing: "Préparation de l’aperçu",
    unavailable: "Aperçu indisponible · cliquer pour modifier",
    retry: "Réessayer les aperçus",
  },
});
