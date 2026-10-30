import {
  memo,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { EnginePort } from "@musart/core";
import type { BindingSnapshot } from "../../state/keybindings/model";
import { useEngineValue } from "../../state/session/editor";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { Button } from "../ui/button";
import { BlurReveal } from "../ui/blur-text-animation";
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
const SEARCH_REVEAL = { durationMs: 150, blur: 3 } as const;
function keepButtonActivation(event: KeyboardEvent<HTMLButtonElement>) {
  // Let the browser activate this button; cmdk must not reinterpret its key as a result choice.
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}
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
    [category, setCategory] = useState<SearchFilter>("all");
  const criteria = useMemo(() => ({ query, category }), [query, category]);
  const deferred = useDeferredValue(criteria);
  const pending = !sameCriteria(criteria, deferred);
  const latest = useRef(criteria),
    displayed = useRef(deferred);
  const [selection, setSelection] = useState({ id: "", criteria });
  const results = useMemo(
    () => searchItems(items, deferred.query, deferred.category),
    [items, deferred],
  );
  const activeItem =
    (sameCriteria(selection.criteria, deferred)
      ? results.items.find((item) => item.id === selection.id && !item.disabled)
      : undefined) ?? results.items.find((item) => !item.disabled);
  const context = useRef({ items, results, onChoose });
  useLayoutEffect(() => {
    displayed.current = deferred;
    context.current = { items, results, onChoose };
  }, [deferred, items, results, onChoose]);
  const changeQuery = useCallback((value: string) => {
    // Native input/Enter may arrive before a background result render commits.
    latest.current = { ...latest.current, query: value };
    setQuery(value);
  }, []);
  const changeCategory = useCallback(
    (value: SearchFilter) => {
      latest.current = { ...latest.current, category: value };
      setCategory(value);
      const input = inputRef.current;
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    },
    [inputRef],
  );
  const select = useCallback((id: string) => {
    if (!sameCriteria(latest.current, displayed.current)) return;
    const criteria = displayed.current;
    setSelection((current) =>
      current.id === id && sameCriteria(current.criteria, criteria) ? current : { id, criteria },
    );
  }, []);
  const choose = useCallback((item: SearchItem) => {
    // `inert` protects native interaction; this guard also rejects already queued row callbacks.
    if (!sameCriteria(latest.current, displayed.current)) return;
    const current = context.current;
    const enabled = current.results.items.find(
      (candidate) => candidate.id === item.id && !candidate.disabled,
    );
    if (enabled) current.onChoose(enabled);
  }, []);
  const captureKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.target !== inputRef.current ||
        event.nativeEvent.isComposing ||
        event.nativeEvent.keyCode === 229 ||
        sameCriteria(latest.current, displayed.current)
      )
        return;
      if (event.key === "Enter") {
        event.preventDefault();
        const current = context.current,
          criteria = latest.current;
        const enabled = searchItems(current.items, criteria.query, criteria.category).items.find(
          (item) => !item.disabled,
        );
        if (enabled) current.onChoose(enabled);
      } else if (
        ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
        (event.ctrlKey && ["j", "n", "p"].includes(event.key))
      )
        event.preventDefault();
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
        onValueChange={select}
        onKeyDownCapture={captureKey}
        className="magic-search-command"
        label={t("search:title")}
      >
        <BlurReveal {...SEARCH_REVEAL} asChild order={0} delayMs={0}>
          <div className="magic-search-input-row">
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={changeQuery}
              placeholder={t("search:search")}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("close")}
              onClick={onClose}
              onKeyDown={keepButtonActivation}
            >
              <Kbd>Esc</Kbd>
            </Button>
          </div>
        </BlurReveal>
        <CategoryTabs category={category} available={available} onChange={changeCategory} t={t} />
        <span className="sr-only" role="status" aria-live="polite" aria-busy={pending}>
          {t("search:resultCount", { count: results.total })}
        </span>
        <ScrollShadow>
          <CommandList
            label={t("search:title")}
            data-search-result-count={results.total}
            data-search-query={deferred.query}
            data-search-category={deferred.category}
            data-search-pending={pending}
            aria-busy={pending}
            inert={pending || undefined}
          >
            <ResultGroups items={results.items} t={t} onChoose={choose} />
          </CommandList>
        </ScrollShadow>
      </Command>
    </div>
  );
});
interface Criteria {
  query: string;
  category: SearchFilter;
}
function sameCriteria(a: Criteria, b: Criteria): boolean {
  return a.query === b.query && a.category === b.category;
}
/** The urgent input commit updates only the busy boundary, retaining the complete result subtree. */
const ResultGroups = memo(function ResultGroups({
  items,
  t,
  onChoose,
}: {
  items: readonly SearchItem[];
  t: SearchTranslate;
  onChoose: Props["onChoose"];
}) {
  const groups = useMemo(() => {
    const grouped = new Map<SearchItem["category"], SearchItem[]>();
    for (const item of items) {
      const group = grouped.get(item.category);
      if (group) group.push(item);
      else grouped.set(item.category, [item]);
    }
    return grouped;
  }, [items]);
  if (!items.length)
    return (
      <BlurReveal {...SEARCH_REVEAL} asChild order={2} delayMs={8}>
        <div cmdk-empty="" role="presentation" className="py-6 text-center text-sm">
          {t("search:empty")}
        </div>
      </BlurReveal>
    );
  let order = 2;
  const count = items.length + groups.size;
  const delay = (rank: number) => 8 + ((rank - 2) / Math.max(1, count - 1)) * 40;
  return [...groups].map(([value, group]) => {
    const headingOrder = order++;
    return (
      <CommandGroup
        key={value}
        heading={
          <BlurReveal {...SEARCH_REVEAL} order={headingOrder} delayMs={delay(headingOrder)}>
            {t(`search:${value}`)}
          </BlurReveal>
        }
      >
        {group.map((item) => {
          const rowOrder = order++;
          return (
            <ResultRow
              key={item.id}
              item={item}
              onChoose={onChoose}
              order={rowOrder}
              delayMs={delay(rowOrder)}
            />
          );
        })}
      </CommandGroup>
    );
  });
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
    <BlurReveal {...SEARCH_REVEAL} asChild order={1} delayMs={4}>
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
            onKeyDown={keepButtonActivation}
          >
            {t(`search:${value}`)}
          </Button>
        ))}
      </div>
    </BlurReveal>
  );
});
const ResultRow = memo(
  function ResultRow({
    item,
    onChoose,
    order,
    delayMs,
  }: {
    item: SearchItem;
    onChoose: Props["onChoose"];
    order: number;
    delayMs: number;
  }) {
    const Icon = getSearchIcon(item);
    return (
      <CommandItem
        value={item.id}
        disabled={Boolean(item.disabled)}
        aria-description={item.disabled}
        onSelect={() => onChoose(item)}
      >
        <BlurReveal {...SEARCH_REVEAL} asChild order={order} delayMs={delayMs}>
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
        </BlurReveal>
      </CommandItem>
    );
    // Entrance positions are captured at mount; changing their rank must not rebuild retained rows.
  },
  (before, after) => before.item === after.item && before.onChoose === after.onChoose,
);
