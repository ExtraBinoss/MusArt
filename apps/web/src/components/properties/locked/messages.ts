import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
export const messages = {
  en: {
    locked: "This layer is locked",
    multiple: "Selected layers are locked",
    parents: "Blocking groups: {{names}}",
    unlock: "Unlock",
  },
  fr: {
    locked: "Ce calque est verrouillé",
    multiple: "Des calques sélectionnés sont verrouillés",
    parents: "Groupes bloquants : {{names}}",
    unlock: "Déverrouiller",
  },
};
registerFeatureTranslations("lockedLayer", messages);
