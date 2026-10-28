import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { FONT_CATALOG } from "@musart/assets";
import type { FontLibraryPort } from "../../../services/fonts/model";
import { invalidateFontMetadata } from "./metadata";
import { resolveFont } from "./catalog";

/** Bundled faces remain available to isolated UI consumers without a platform library. */
export const bundledFontLibrary: FontLibraryPort = {
  catalog: () => Promise.resolve(FONT_CATALOG),
  installed: () => Promise.resolve(FONT_CATALOG),
  install: (font) =>
    FONT_CATALOG.some((item) => item.id === font.id)
      ? Promise.resolve(font)
      : Promise.reject(new Error("Font installation requires a platform library.")),
  importFile: () => Promise.reject(new Error("Font import requires a platform library.")),
  async resolve(family, weight, signal) {
    const font = resolveFont(family),
      file = font.id === "tinos" && weight >= 600 ? "bold" : "font";
    const response = await fetch(`/fonts/${font.id}/${file}.ttf`, { signal });
    if (!response.ok) throw new Error("The bundled font could not be loaded.");
    return response.arrayBuffer();
  },
  discoverLocal: () => Promise.resolve([]),
  supportsLocalFonts: false,
  subscribe: () => () => undefined,
  dispose: () => undefined,
};
const FontLibraryContext = createContext<FontLibraryPort>(bundledFontLibrary);

export function FontLibraryProvider({
  library,
  children,
}: {
  library: FontLibraryPort;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const unsubscribe = library.subscribe(() => invalidateFontMetadata(library));
    return () => {
      unsubscribe();
      invalidateFontMetadata(library);
    };
  }, [library]);
  return <FontLibraryContext.Provider value={library}>{children}</FontLibraryContext.Provider>;
}

export function useFontLibrary(): FontLibraryPort {
  return useContext(FontLibraryContext);
}
