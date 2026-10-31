import { HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../state/i18n";
import "../styles/fonts.css";
import "../styles/global.css";

const themeScript = `try{const t=localStorage.getItem('musart.theme')||'system';const d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch{}`;

/** Stable French server/client markup, followed by the device's saved language. */
export function RootDocument({ children }: { children: ReactNode }) {
  const [translations] = useState(() => i18n.cloneInstance({ lng: "fr" }));
  useEffect(() => {
    const update = (language: string) => {
      void translations.changeLanguage(language);
      document.documentElement.lang = language;
    };
    i18n.on("languageChanged", update);
    return () => {
      i18n.off("languageChanged", update);
    };
  }, [translations]);
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <I18nextProvider i18n={translations}>{children}</I18nextProvider>
        <Scripts />
      </body>
    </html>
  );
}
