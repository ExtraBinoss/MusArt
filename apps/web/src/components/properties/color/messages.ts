import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
registerFeatureTranslations("color", {
  en: {
    sample: "Pick a screen color",
    failed: "Screen color sampling failed. Try again.",
    pending: "Choose a color on screen, or press Escape to cancel.",
  },
  fr: {
    sample: "Prélever une couleur à l’écran",
    failed: "Le prélèvement a échoué. Réessayez.",
    pending: "Choisissez une couleur à l’écran, ou appuyez sur Échap pour annuler.",
  },
});
