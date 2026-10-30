import { useCallback, useEffect, useRef, useState } from "react";
import {
  readLibraryFavorites,
  setLibraryFavorite,
  type LibraryItem,
} from "../../../services/projects/library/favorites";
export function useFavorites() {
  const [items, setItems] = useState<LibraryItem[]>([]),
    [error, setError] = useState(false),
    [saving, setSaving] = useState(false);
  const life = useRef({ active: false, request: 0 }),
    channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(() => {
    const request = ++life.current.request;
    return readLibraryFavorites().then(
      (next) => {
        if (life.current.active && request === life.current.request) {
          setItems(next);
          setError(false);
        }
      },
      () => {
        if (life.current.active && request === life.current.request) setError(true);
      },
    );
  }, []);
  useEffect(() => {
    const owner = life.current;
    owner.active = true;
    void refresh();
    const connection =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("musart-library-favorites");
    channel.current = connection;
    if (connection) connection.onmessage = () => void refresh();
    return () => {
      owner.active = false;
      owner.request++;
      connection?.close();
      channel.current = null;
    };
  }, [refresh]);
  const toggle = useCallback(
    async (item: LibraryItem, selected: boolean) => {
      if (saving) return;
      setSaving(true);
      try {
        await setLibraryFavorite(item, selected);
        if (life.current.active) {
          await refresh();
          channel.current?.postMessage("changed");
        }
      } finally {
        if (life.current.active) setSaving(false);
      }
    },
    [saving, refresh],
  );
  return { items, error, saving, refresh, toggle };
}
