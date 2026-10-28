import { useMemo, useRef, useState } from "react";
import { Check, Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui/button";
import { SearchInput } from "../../../assets/SearchInput";
import { ScrollShadow } from "../../../shared/scroll/ScrollShadow";
import { useVirtualList } from "../../../shared/scroll/use-virtual-list";
import type { SearchItem } from "../../../search/catalog/model";
import { MAX_DOCK_COMMANDS } from "../preferences";
import "../messages";
const ROW_HEIGHT = 35;
/** Mounted with its popover so observers always bind to the actual catalog viewport. */
export function CommandCatalog({
  ids,
  commands,
  onChange,
}: {
  ids: readonly string[];
  commands: readonly SearchItem[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation(),
    [query, setQuery] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const available = useMemo(
    () =>
      commands.filter((item) =>
        `${item.label} ${item.terms}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      ),
    [commands, query],
  );
  const list = useVirtualList(available.length, ROW_HEIGHT, viewport);
  return (
    <>
      <SearchInput
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (viewport.current) {
            viewport.current.scrollTop = 0;
            list.onScroll({ currentTarget: viewport.current });
          }
        }}
        aria-label={t("dock:search")}
        prefix={t("dock:search")}
      />
      <ScrollShadow className="dock-customizer-available">
        <div
          className="dock-catalog-viewport"
          ref={viewport}
          role="list"
          aria-label={t("dock:available")}
          onScroll={list.onScroll}
        >
          <div
            className="dock-catalog-space"
            style={{ height: list.height }}
            data-total-commands={available.length}
          >
            {available.slice(list.first, list.last).map((command, offset) => {
              const pinned = ids.includes(command.id);
              return (
                <div
                  role="listitem"
                  aria-posinset={list.first + offset + 1}
                  aria-setsize={available.length}
                  key={command.id}
                  style={{
                    position: "absolute",
                    top: (list.first + offset) * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={pinned}
                    disabled={!pinned && ids.length >= MAX_DOCK_COMMANDS}
                    aria-label={t(pinned ? "dock:unpin" : "dock:pin", { name: command.label })}
                    onClick={() =>
                      onChange(
                        pinned ? ids.filter((id) => id !== command.id) : [...ids, command.id],
                      )
                    }
                  >
                    <span>{command.label}</span>
                    {pinned ? <Check size={14} /> : <Pin size={14} />}
                  </Button>
                </div>
              );
            })}
          </div>
          {!available.length && <p>{t("dock:empty")}</p>}
        </div>
      </ScrollShadow>
    </>
  );
}
