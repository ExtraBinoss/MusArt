import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import { libraryItemKey, type LibraryItem } from "../../../services/projects/library/favorites";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { LibraryItemsContext } from "./context";
import { ItemPreview } from "./ItemPreview";
import { useFavorites } from "./use-favorites";
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
  const { t } = useTranslation("libraryItem"),
    favorites = useFavorites();
  const [selected, setSelected] = useState<{ item: LibraryItem; open: () => void } | null>(null),
    [error, setError] = useState(false);
  const inspect = useCallback((item: LibraryItem, open: () => void) => {
    setSelected({ item, open });
    setError(false);
  }, []);
  const context = useMemo(() => ({ inspect }), [inspect]);
  const favorite =
    selected &&
    favorites.items.some((item) => libraryItemKey(item) === libraryItemKey(selected.item));
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
        {selected && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setSelected(null);
            }}
          >
            <DialogContent className="library-item-dialog" showCloseButton={!busy}>
              <div className="library-item-info">
                <span className="library-item-kind">{t(selected.item.kind)}</span>
                <DialogTitle>{t("open")}</DialogTitle>
                <h2 className="library-item-name">{selected.item.name}</h2>
                <DialogDescription>{t("hint")}</DialogDescription>
                <div className="library-item-author">
                  <MeltLogo
                    size={38}
                    className={selected.item.kind === "project" ? "library-author-avatar" : ""}
                  />
                  <span>
                    <small>{t("author")}</small>
                    <strong>
                      {selected.item.kind === "project" ? `ExtraBinoss · ${t("me")}` : "Melt"}
                    </strong>
                  </span>
                </div>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const action = selected.open;
                    setSelected(null);
                    action();
                  }}
                >
                  <ArrowUpRight size={15} />
                  {t("open")}
                </Button>
                <Button
                  variant="outline"
                  disabled={favorites.saving || busy}
                  aria-pressed={!!favorite}
                  onClick={() => {
                    setError(false);
                    void favorites.toggle(selected.item, !favorite).catch(() => setError(true));
                  }}
                >
                  <Star size={14} fill={favorite ? "currentColor" : "none"} />
                  {t(favorite ? "unfavorite" : "favorite")}
                </Button>
                {error && <p role="alert">{t("saveFailed")}</p>}
              </div>
              <ItemPreview
                key={libraryItemKey(selected.item)}
                item={selected.item}
                services={services}
              />
            </DialogContent>
          </Dialog>
        )}
      </LibraryItemsContext.Provider>
    </FavoritesOutletContext.Provider>
  );
}
// One durable favorites owner serves details, badges and ordering in both normal grids.
const FavoritesOutletContext = createContext<ReturnType<typeof useFavorites> | null>(null);
export function useLibraryFavorites() {
  return useContext(FavoritesOutletContext);
}
