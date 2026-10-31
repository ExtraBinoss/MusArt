import { useCallback, useMemo, useState, type ReactNode } from "react";
import { atom, useSetAtom } from "jotai";
import { ItemDialog, type LibrarySelection } from "./ItemDialog";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import { type LibraryItem } from "../../../services/projects/library/favorites";
import { Button } from "../../ui/button";
import { LibraryItemsContext } from "./context";
import { useFavorites } from "./use-favorites";
import { FavoritesOutletContext } from "./favorites-context";
export { useLibraryFavorites } from "./favorites-context";
import "./messages";
import "./items.css";
export function LibraryOpenButton({
  onOpen,
  label,
  disabled,
}: {
  onOpen: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      className="library-item-open"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <ArrowUpRight size={15} />
    </Button>
  );
}
export function LibraryBrowser({
  children,
  services,
  busy,
}: {
  children: ReactNode;
  services: EditorServices;
  busy: boolean;
}) {
  const { t } = useTranslation("libraryItem");
  const favorites = useFavorites();
  const [selection] = useState(() => atom<LibrarySelection | null>(null));
  const select = useSetAtom(selection);
  const inspect = useCallback(
    (item: LibraryItem, open: () => void) => {
      select({
        item,
        open,
        returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      });
    },
    [select],
  );
  const context = useMemo(() => ({ inspect }), [inspect]);
  return (
    <FavoritesOutletContext.Provider value={favorites}>
      <LibraryItemsContext.Provider value={context}>
        {children}
        {favorites.error && (
          <div className="library-favorite-error" role="alert">
            {t("readFailed")}{" "}
            <button type="button" onClick={() => void favorites.refresh()}>
              {t("retry")}
            </button>
          </div>
        )}
        <ItemDialog selection={selection} services={services} busy={busy} />
      </LibraryItemsContext.Provider>
    </FavoritesOutletContext.Provider>
  );
}
