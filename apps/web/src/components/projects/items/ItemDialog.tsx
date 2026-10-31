import { useState } from "react";
import { useAtomValue, type Atom } from "jotai";
import { ArrowUpRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import { libraryItemKey, type LibraryItem } from "../../../services/projects/library/favorites";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { ItemPreview } from "./ItemPreview";
import { useLibraryFavorites } from "./favorites-context";

export interface LibrarySelection {
  item: LibraryItem;
  open: () => void;
  returnFocus: HTMLElement | null;
}
/** Selection and dismissal subscribe at the dialog leaf, leaving the grid/provider untouched. */
export function ItemDialog({
  selection,
  services,
  busy,
}: {
  selection: Atom<LibrarySelection | null>;
  services: EditorServices;
  busy: boolean;
}) {
  const { t } = useTranslation("libraryItem");
  const selected = useAtomValue(selection);
  const favorites = useLibraryFavorites()!;
  const [dismissed, setDismissed] = useState<LibrarySelection | null>(null);
  const [failed, setFailed] = useState<LibrarySelection | null>(null);
  const open = !!selected && selected !== dismissed;
  const favorite =
    selected &&
    favorites.items.some((item) => libraryItemKey(item) === libraryItemKey(selected.item));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) setDismissed(selected);
      }}
    >
      {selected && (
        <DialogContent
          className="library-item-dialog"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (selected.returnFocus?.isConnected)
              selected.returnFocus.focus({ preventScroll: true });
          }}
        >
          <div className="library-item-info">
            <DialogTitle className="library-item-name">{selected.item.name}</DialogTitle>
            <span className="library-item-kind">{t(selected.item.kind)}</span>
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
              className="library-item-primary"
              disabled={busy}
              onClick={() => {
                setDismissed(selected);
                selected.open();
              }}
            >
              <ArrowUpRight size={15} />
              <span>{t("open")}</span>
            </Button>
            <Button
              variant="outline"
              disabled={favorites.saving || busy}
              aria-pressed={!!favorite}
              onClick={() => {
                setFailed(null);
                void favorites.toggle(selected.item, !favorite).catch(() => setFailed(selected));
              }}
            >
              <Star size={14} fill={favorite ? "currentColor" : "none"} />
              <span>{t(favorite ? "unfavorite" : "favorite")}</span>
            </Button>
            {failed === selected && <p role="alert">{t("saveFailed")}</p>}
          </div>
          <ItemPreview
            key={libraryItemKey(selected.item)}
            item={selected.item}
            services={services}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
