import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";

export const messages = {
  en: {
    title: "Customize dock",
    pinned: "Pinned shortcuts",
    available: "Available commands",
    search: "Search commands",
    pin: "Pin {{name}}",
    unpin: "Unpin {{name}}",
    up: "Move {{name}} up",
    down: "Move {{name}} down",
    hint: "Drag shortcuts to reorder. Use the arrow buttons here with a keyboard.",
    limit: "Pin up to {{count}} shortcuts.",
    empty: "No matching commands",
    reordered: "Shortcut order updated",
  },
  fr: {
    title: "Personnaliser le dock",
    pinned: "Raccourcis épinglés",
    available: "Commandes disponibles",
    search: "Rechercher une commande",
    pin: "Épingler {{name}}",
    unpin: "Désépingler {{name}}",
    up: "Monter {{name}}",
    down: "Descendre {{name}}",
    hint: "Glissez les raccourcis pour les déplacer. Au clavier, utilisez les flèches ici.",
    limit: "Épinglez jusqu’à {{count}} raccourcis.",
    empty: "Aucune commande correspondante",
    reordered: "Ordre des raccourcis modifié",
  },
};
registerFeatureTranslations("dock", messages);
