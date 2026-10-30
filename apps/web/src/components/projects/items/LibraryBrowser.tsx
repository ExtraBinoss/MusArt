import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import { libraryItemKey, type LibraryItem } from "../../../services/projects/library/favorites";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { LibraryItemsContext, useLibraryItemActivation } from "./context";
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
function FavoriteItem({
  item,
  open,
  disabled,
}: {
  item: LibraryItem;
  open: () => void;
  disabled: boolean;
}) {
  const activation = useLibraryItemActivation(item, open, disabled);
  return (
    <button
      className="library-favorite-item"
      disabled={disabled}
      onClick={activation.click}
      onDoubleClick={activation.double}
    >
      <Star size={12} fill="currentColor" />
      <span>{item.name}</span>
    </button>
  );
}
export function LibraryBrowser({
  children,
  services,
  busy,
  onOpenProject,
  onOpenTemplate,
}: {
  children: ReactNode;
  services: EditorServices;
  busy: boolean;
  onOpenProject: (id: string) => void;
  onOpenTemplate: (id: string) => void;
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
    <FavoritesOutletContext.Provider value={{ ...favorites, busy, onOpenProject, onOpenTemplate }}>
      <LibraryItemsContext.Provider value={context}>
        {children}
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
// One favorites owner serves the detail dialog and the rail above the library search.
type FavoritesView = ReturnType<typeof useFavorites> & {
  busy: boolean;
  onOpenProject: (id: string) => void;
  onOpenTemplate: (id: string) => void;
};
const FavoritesOutletContext = createContext<FavoritesView | null>(null);
export function FavoritesRail() {
  const view = useContext(FavoritesOutletContext),
    { t } = useTranslation("libraryItem");
  if (!view) return null;
  return (
    <section className="library-favorites" aria-label={t("favorites")}>
      <h3>
        <Star size={13} />
        {t("favorites")}
      </h3>
      {view.error ? (
        <button onClick={() => void view.refresh()}>
          {t("readFailed")} · {t("retry")}
        </button>
      ) : view.items.length ? (
        <div className="library-favorite-list">
          {view.items.map((item) => (
            <FavoriteItem
              key={libraryItemKey(item)}
              item={item}
              disabled={view.busy}
              open={() =>
                item.kind === "project" ? view.onOpenProject(item.id) : view.onOpenTemplate(item.id)
              }
            />
          ))}
        </div>
      ) : (
        <p>{t("empty")}</p>
      )}
    </section>
  );
}
