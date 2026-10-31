import { createContext, useContext } from "react";
import type { useFavorites } from "./use-favorites";

export const FavoritesOutletContext = createContext<ReturnType<typeof useFavorites> | null>(null);
export function useLibraryFavorites() {
  return useContext(FavoritesOutletContext);
}
