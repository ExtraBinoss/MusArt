import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { translations } from "./catalogs";

export function readLanguage(): "fr" | "en" {
  try {
    return localStorage.getItem("musart.language") === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}
const initialLanguage = readLanguage();
if (typeof document !== "undefined") document.documentElement.lang = initialLanguage;
void i18n.use(initReactI18next).init({
  resources: translations,
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initAsync: false,
});
export async function changeLanguage(language: "fr" | "en") {
  await i18n.changeLanguage(language);
  document.documentElement.lang = language;
  try {
    localStorage.setItem("musart.language", language);
  } catch {
    /* Session language remains usable. */
  }
}
export { i18n };
