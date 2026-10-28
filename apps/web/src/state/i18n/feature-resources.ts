import i18n from "i18next";

type FeatureMessages = { en: Record<string, unknown>; fr: Record<string, unknown> };
const pending = new Map<string, FeatureMessages>();
let listening = false;
function install(namespace: string, messages: FeatureMessages) {
  for (const language of ["en", "fr"] as const)
    i18n.addResourceBundle(language, namespace, messages[language], true, true);
}
function flush() {
  for (const [namespace, messages] of pending) install(namespace, messages);
  pending.clear();
  listening = false;
  i18n.off("initialized", flush);
}

/** A feature owns its messages; the app keeps one shared locale and storage preference. */
export function registerFeatureTranslations(namespace: string, messages: FeatureMessages): void {
  if (i18n.isInitialized) install(namespace, messages);
  else {
    pending.set(namespace, messages);
    if (!listening) {
      listening = true;
      i18n.on("initialized", flush);
    }
  }
}
