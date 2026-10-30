import { memo, useCallback, useMemo, useState, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { BindingSnapshot } from "../../state/keybindings/model";
import { useEngineValue } from "../../state/session/editor";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { Button } from "../ui/button";
import { DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "../ui/command";
import { Kbd, KbdGroup } from "../ui/kbd";
import type { SearchCatalog } from "./catalog/cache";
import {
  SEARCH_CATEGORIES,
  type SearchFilter,
  type SearchItem,
  type SearchTranslate,
} from "./catalog/model";
import { searchItems } from "./catalog/search";
import { getSearchIcon } from "./icons";
import { modifierLabel } from "./shortcuts";
import { useSearchPlaceholder } from "./use-search-placeholder";
import "./messages";

// cmdk still scores newly registered items when shouldFilter=false. Ranking already belongs to our index.
const alreadyRanked = () => 1;
interface Props {
  engine: EnginePort;
  catalog: SearchCatalog;
  t: SearchTranslate;
  bindings: BindingSnapshot;
  locale: string;
  inputRef: RefObject<HTMLInputElement | null>;
  reduced: boolean;
  onChoose: (item: SearchItem) => void;
  onClose: () => void;
}
/** Only this mounted palette owns query/selection updates; neither input nor hover rebuilds the editor shell. */
export const SearchPalette = memo(function SearchPalette({
  engine,
  catalog,
  t,
  bindings,
  locale,
  inputRef,
  reduced,
  onChoose,
  onClose,
}: Props) {
  const items = useEngineValue(engine, (snapshot) => catalog.read(snapshot, t, bindings, locale));
  return (
    <PaletteContent
      items={items}
      available={catalog.categories}
      t={t}
      inputRef={inputRef}
      reduced={reduced}
      onChoose={onChoose}
      onClose={onClose}
    />
  );
});
const PaletteContent = memo(function PaletteContent({
  items,
  available,
  t,
  inputRef,
  reduced,
  onChoose,
  onClose,
}: Pick<Props, "t" | "inputRef" | "reduced" | "onChoose" | "onClose"> & {
  items: readonly SearchItem[];
  available: ReadonlySet<SearchItem["category"]>;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<SearchFilter>("all"),
    [activeId, setActiveId] = useState("");
  const results = useMemo(() => searchItems(items, query, category), [items, query, category]);
  // Supply the enabled selection before cmdk mounts, and synchronously when query results change.
  const activeItem =
    results.items.find((item) => item.id === activeId && !item.disabled) ??
    results.items.find((item) => !item.disabled);
  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setActiveId("");
  }, []);
  const groups = useMemo(() => {
    const grouped = new Map<SearchItem["category"], SearchItem[]>();
    for (const item of results.items) {
      const group = grouped.get(item.category);
      if (group) group.push(item);
      else grouped.set(item.category, [item]);
    }
    return grouped;
  }, [results]);
  const changeCategory = useCallback(
    (value: SearchFilter) => {
      setCategory(value);
      setActiveId("");
      inputRef.current?.focus({ preventScroll: true });
    },
    [inputRef],
  );
  useSearchPlaceholder(inputRef, items, t("search:searchPrefix"), reduced);
  return (
    <div className="magic-search-surface" data-reduced-motion={reduced || undefined}>
      <DialogHeader className="sr-only">
        <DialogTitle>{t("search:title")}</DialogTitle>
        <DialogDescription>{t("search:description")}</DialogDescription>
      </DialogHeader>
      <Command
        shouldFilter={false}
        filter={alreadyRanked}
        loop
        value={activeItem?.id ?? ""}
        onValueChange={setActiveId}
        className="magic-search-command"
        label={t("search:title")}
      >
        <div className="magic-search-input-row">
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={changeQuery}
            placeholder={t("search:search")}
          />
          <Button variant="ghost" size="icon-sm" aria-label={t("close")} onClick={onClose}>
            <Kbd>Esc</Kbd>
          </Button>
        </div>
        <CategoryTabs category={category} available={available} onChange={changeCategory} t={t} />
        <span className="sr-only" role="status" aria-live="polite">
          {t("search:resultCount", { count: results.total })}
        </span>
        <ScrollShadow>
          <CommandList label={t("search:title")} data-search-result-count={results.total}>
            {!results.items.length && (
              <div cmdk-empty="" role="presentation" className="py-6 text-center text-sm">
                {t("search:empty")}
              </div>
            )}
            {[...groups].map(([value, group]) => (
              <CommandGroup key={value} heading={t(`search:${value}`)}>
                {group.map((item) => (
                  <ResultRow key={item.id} item={item} onChoose={onChoose} />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </ScrollShadow>
      </Command>
    </div>
  );
});
const CategoryTabs = memo(function CategoryTabs({
  category,
  available,
  onChange,
  t,
}: {
  category: SearchFilter;
  available: ReadonlySet<SearchItem["category"]>;
  onChange: (category: SearchFilter) => void;
  t: SearchTranslate;
}) {
  return (
    <div className="magic-search-categories" role="group" aria-label={t("search:categories")}>
      {(
        ["all", ...SEARCH_CATEGORIES.filter((value) => available.has(value))] as SearchFilter[]
      ).map((value) => (
        <Button
          key={value}
          variant={category === value ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={category === value}
          onClick={() => onChange(value)}
        >
          {t(`search:${value}`)}
        </Button>
      ))}
    </div>
  );
});
const ResultRow = memo(function ResultRow({
  item,
  onChoose,
}: {
  item: SearchItem;
  onChoose: Props["onChoose"];
}) {
  const Icon = getSearchIcon(item);
  return (
    <CommandItem
      value={item.id}
      disabled={Boolean(item.disabled)}
      aria-description={item.disabled}
      onSelect={() => onChoose(item)}
    >
      <span className="magic-search-item-content">
        <Icon size={16} strokeWidth={1.6} />
        <span className="magic-search-item-copy">
          <span>{item.label}</span>
          {(item.disabled || item.detail) && <small>{item.disabled || item.detail}</small>}
        </span>
        {item.shortcut && (
          <KbdGroup>
            {item.shortcut.map((key) => (
              <Kbd key={key}>{key === "Mod" ? modifierLabel() : key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </span>
    </CommandItem>
  );
});
