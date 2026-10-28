import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FONT_CATALOG, MAX_FONT_FILE_BYTES, createSearchIndex } from "@musart/assets";
import type { Layer } from "@musart/core";
import type { FontLibraryPort } from "../../../services/fonts/model";
import type { PropertyActions } from "../TextProperties";
import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import { Kbd } from "../../ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SearchInput } from "../../assets/SearchInput";
import { readRecentFonts, rememberFont, findFont, type FontOption } from "./catalog";
import { invalidateFontMetadata, loadFontMetadata, peekFontMetadata } from "./metadata";
import { bundledFontLibrary, useFontLibrary } from "./library-context";
import styles from "./FontPicker.module.css";
import "./messages";

const ROW_HEIGHT = 44,
  VIEW_ROWS = 6,
  OVERSCAN = 2;
type Category = "all" | "installed" | FontOption["category"];
const categories = ["all", "sans", "serif", "mono", "display", "handwriting", "installed"] as const;
const declinedDiscovery = new WeakSet<FontLibraryPort>();
const discoveries = new WeakMap<FontLibraryPort, Promise<readonly FontOption[]>>();
const mergeFonts = (...lists: readonly (readonly FontOption[])[]) => [
  ...new Map(lists.flat().map((font) => [font.id, font])).values(),
];

/** A bounded list previews through the same imperative path as numeric and color edits. */
export function FontPicker({ layer, patch, preview, cancel }: PropertyActions & { layer: Layer }) {
  const { t } = useTranslation("fonts"),
    { t: common } = useTranslation();
  const library = useFontLibrary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>("all");
  const [fonts, setFonts] = useState<readonly FontOption[]>(() =>
    mergeFonts(FONT_CATALOG, peekFontMetadata(library) ?? []),
  );
  const [installedIds, setInstalledIds] = useState<ReadonlySet<string>>(
    () => new Set(FONT_CATALOG.map((font) => font.id)),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [localUnavailable, setLocalUnavailable] = useState(false);
  const [metadataReady, setMetadataReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  const activePreview = useRef(false),
    previewFamily = useRef<string | null>(null);
  const cancelRef = useRef(cancel),
    latest = useRef(layer),
    latestLibrary = useRef(library),
    alive = useRef(true),
    request = useRef(0);
  const id = useId(),
    listId = `${id}-fonts`,
    current = findFont(layer.fontFamily, fonts);
  const currentLabel =
    current?.label ??
    current?.family ??
    (/^(custom|local):/.test(layer.fontFamily)
      ? t(metadataReady ? "unavailable" : "loading")
      : layer.fontFamily);
  const search = useMemo(
    () =>
      open
        ? createSearchIndex(fonts, {
            text: (font) => font.label ?? font.family,
            keywords: (font) => `${font.category} ${t(`category.${font.category}`)}`,
          })
        : null,
    [fonts, t, open],
  );
  const filtered =
    search?.search(query, {
      limit: fonts.length,
      filter: (font) =>
        category === "all" ||
        (category === "installed" ? installedIds.has(font.id) : font.category === category),
    }) ?? [];
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visible = filtered.slice(first, first + VIEW_ROWS + OVERSCAN * 2);
  useLayoutEffect(() => {
    cancelRef.current = cancel;
    latest.current = layer;
    latestLibrary.current = library;
  }, [cancel, layer, library]);
  useLayoutEffect(() => {
    if (open && list.current) list.current.scrollTop = scrollTop;
  }, [open, scrollTop]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (activePreview.current) cancelRef.current();
    };
  }, []);
  const needsMetadata = open || /^(custom|local):/.test(layer.fontFamily);
  useEffect(() => {
    if (!needsMetadata) return;
    let mounted = true,
      revision = 0;
    function refresh(changed = false) {
      if (changed) invalidateFontMetadata(library);
      const version = ++revision;
      void Promise.all([
        open ? library.catalog() : Promise.resolve(FONT_CATALOG),
        loadFontMetadata(library),
      ]).then(
        ([catalog, installed]) => {
          if (!mounted || version !== revision) return;
          const merged = mergeFonts(FONT_CATALOG, catalog, installed);
          setFonts((previous) => mergeFonts(previous, merged));
          setInstalledIds(
            (previous) =>
              new Set([
                ...previous,
                ...FONT_CATALOG.map((font) => font.id),
                ...installed.map((font) => font.id),
              ]),
          );
          setMetadataReady(true);
          const saved = readRecentFonts(merged);
          if (saved.length) setRecent(saved);
        },
        () => {
          if (mounted && version === revision) {
            setMetadataReady(true);
            setError(t("loadFailed"));
          }
        },
      );
    }
    // Opening always refreshes browser-wide metadata, including changes from
    // another tab. Closed pickers only need a lookup for a persisted custom ID.
    if (
      open ||
      (peekFontMetadata(library) && !findFont(layer.fontFamily, peekFontMetadata(library)))
    )
      invalidateFontMetadata(library);
    refresh();
    const unsubscribe = library.subscribe(() => refresh(true));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [library, open, t, needsMetadata, layer.fontFamily]);

  function resetPreview() {
    if (!activePreview.current) return;
    activePreview.current = false;
    previewFamily.current = null;
    cancel();
  }
  function show(value: boolean) {
    if (value && layer.locked) return;
    request.current++;
    setPending(null);
    if (!value) resetPreview();
    else {
      // Call directly in the trigger gesture, before an await can lose user activation.
      if (!library.supportsLocalFonts || declinedDiscovery.has(library)) setLocalUnavailable(true);
      else {
        let discovery = discoveries.get(library);
        if (!discovery) {
          try {
            discovery = library.discoverLocal();
          } catch {
            discovery = Promise.reject(new Error("System fonts unavailable"));
          }
          discoveries.set(library, discovery);
          void discovery.finally(() => discoveries.delete(library)).catch(() => undefined);
        }
        void discovery.then(
          (local) => {
            if (alive.current && latestLibrary.current === library)
              setFonts((previous) => mergeFonts(previous, local));
          },
          () => {
            declinedDiscovery.add(library);
            if (alive.current && latestLibrary.current === library) setLocalUnavailable(true);
          },
        );
      }
      setError("");
      setQuery("");
      setCategory("all");
      setActive(-1);
      const at = fonts.findIndex((font) => font.id === current?.id);
      setScrollTop(
        Math.min(
          Math.max(0, fonts.length - VIEW_ROWS) * ROW_HEIGHT,
          Math.max(0, at - 2) * ROW_HEIGHT,
        ),
      );
      const saved = readRecentFonts(fonts);
      if (saved.length) setRecent(saved);
    }
    setOpen(value);
  }
  function previewFont(font: FontOption, index?: number) {
    if (layer.locked || pending) return;
    if (index !== undefined) setActive(index);
    if (previewFamily.current === font.family) return;
    activePreview.current = true;
    previewFamily.current = font.family;
    preview({ fontFamily: font.family });
  }
  function apply(font: FontOption) {
    resetPreview();
    if (font.family !== layer.fontFamily) patch({ fontFamily: font.family });
    const catalog = mergeFonts(fonts, [font]);
    setFonts(catalog);
    setInstalledIds((previous) => new Set([...previous, font.id]));
    setRecent(rememberFont(font.id, recent, catalog));
    request.current++;
    setPending(null);
    setOpen(false);
  }
  function operation(action: () => Promise<FontOption>, key: string, failure: string) {
    const version = ++request.current,
      origin = layer;
    setPending(key);
    setError("");
    void Promise.resolve()
      .then(action)
      .then(
        (font) => {
          if (!alive.current || version !== request.current) return;
          if (latestLibrary.current !== library) {
            resetPreview();
            setPending(null);
            return;
          }
          const current = latest.current;
          if (
            current.id === origin.id &&
            current.fontFamily === origin.fontFamily &&
            current.fontWeight === origin.fontWeight &&
            !current.locked
          )
            apply(font);
          else {
            resetPreview();
            setPending(null);
          }
        },
        () => {
          if (alive.current && version === request.current) {
            resetPreview();
            setPending(null);
            setError(t(failure));
          }
        },
      );
  }
  function choose(font: FontOption) {
    if (layer.locked || pending) return;
    if (library === bundledFontLibrary) apply(font);
    else operation(() => library.install(font, layer.fontWeight), font.id, "installFailed");
  }
  function importFile(file: File | undefined) {
    if (!file || layer.locked || pending) return;
    if (file.size > MAX_FONT_FILE_BYTES) {
      setError(t("tooLarge"));
      return;
    }
    if (!/\.(ttf|otf)$/i.test(file.name)) {
      setError(t("importFailed"));
      return;
    }
    operation(() => library.importFile(file), "import", "importFailed");
  }
  function move(direction: -1 | 1) {
    if (!filtered.length) return;
    const next =
      active < 0
        ? direction === 1
          ? 0
          : filtered.length - 1
        : (active + direction + filtered.length) % filtered.length;
    const top = next * ROW_HEIGHT,
      bottom = top + ROW_HEIGHT;
    if (list.current) {
      const height = list.current.clientHeight || ROW_HEIGHT * VIEW_ROWS;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (bottom > list.current.scrollTop + height) list.current.scrollTop = bottom - height;
      setScrollTop(list.current.scrollTop);
    }
    previewFont(filtered[next]!, next);
  }
  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={common("fontFamily")}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          disabled={layer.locked}
          className={styles.trigger}
        >
          <span>{currentLabel}</span>
          <ChevronDown size={13} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className={`floating-panel ${styles.popover}`}>
        <div className={styles.header}>
          <strong>{t("title")}</strong>
          <span>{fonts.length}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("import")}
            title={t("importHint")}
            disabled={pending !== null || library === bundledFontLibrary || layer.locked}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} />
          </Button>
        </div>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          aria-label={t("import")}
          onChange={(event) => {
            importFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <div className={styles.search}>
          <SearchInput
            id={`${id}-font-search`}
            autoFocus
            searchButton
            captureTyping
            role="combobox"
            aria-label={t("search")}
            aria-autocomplete="list"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={
              active >= 0 && filtered[active] ? `${id}-font-${filtered[active]!.id}` : undefined
            }
            prefix={t("searchPrefix")}
            hints={fonts.slice(0, 6).map((font) => ({ label: font.label ?? font.family }))}
            value={query}
            onChange={(event) => {
              request.current++;
              setPending(null);
              resetPreview();
              setQuery(event.currentTarget.value);
              setActive(-1);
              setScrollTop(0);
              if (list.current) list.current.scrollTop = 0;
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                move(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                const font = filtered[Math.max(0, active)];
                if (font) {
                  event.preventDefault();
                  choose(font);
                }
              }
            }}
          />
        </div>
        <div className={styles.filters}>
          <ButtonGroup aria-label={t("categories")}>
            {categories.map((item) => (
              <Button
                key={item}
                size="xs"
                variant="outline"
                aria-pressed={category === item}
                onClick={() => {
                  request.current++;
                  setPending(null);
                  resetPreview();
                  setCategory(item);
                  setActive(-1);
                  setScrollTop(0);
                  if (list.current) list.current.scrollTop = 0;
                }}
              >
                {t(item === "all" || item === "installed" ? item : `filter.${item}`)}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        {!query && recent.length > 0 && (
          <div className={styles.recents} role="group" aria-label={t("recent")}>
            <span>{t("recent")}</span>
            <div>
              {recent.map((item) => {
                const font = fonts.find((font) => font.id === item);
                return font ? (
                  <button
                    type="button"
                    key={item}
                    onPointerEnter={() => previewFont(font)}
                    onFocus={() => previewFont(font)}
                    onClick={() => choose(font)}
                  >
                    {font.label ?? font.family}
                  </button>
                ) : null;
              })}
            </div>
          </div>
        )}
        <ScrollShadow className={styles.listShadow}>
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={t("title")}
            className={styles.list}
            style={{ height: ROW_HEIGHT * VIEW_ROWS }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                move(event.key === "ArrowDown" ? 1 : -1);
                document.getElementById(`${id}-font-search`)?.focus({ preventScroll: true });
              }
            }}
          >
            <div className={styles.space} style={{ height: filtered.length * ROW_HEIGHT }}>
              <div className={styles.rows} style={{ top: first * ROW_HEIGHT }}>
                {visible.map((font, offset) => {
                  const index = first + offset;
                  return (
                    <button
                      type="button"
                      role="option"
                      key={font.id}
                      id={`${id}-font-${font.id}`}
                      aria-label={font.label ?? font.family}
                      aria-selected={active >= 0 ? active === index : current?.id === font.id}
                      aria-setsize={filtered.length}
                      aria-posinset={index + 1}
                      tabIndex={-1}
                      className={styles.row}
                      data-active={active === index || undefined}
                      onPointerEnter={() => previewFont(font, index)}
                      onFocus={() => previewFont(font, index)}
                      onClick={() => choose(font)}
                    >
                      <span className={styles.sample} aria-hidden>
                        Aa
                      </span>
                      <span className={styles.name}>
                        <span>{font.label ?? font.family}</span>
                        <small>{t(`category.${font.category}`)}</small>
                      </span>
                      {current?.id === font.id && <Check size={14} aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
            {!filtered.length && <p className={styles.empty}>{t("empty")}</p>}
          </div>
        </ScrollShadow>
        {pending && (
          <p className={styles.status} role="status">
            <LoaderCircle size={13} className="animate-spin" />
            {t("installing")}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <footer className={styles.footer}>
          <span>{t("preview")}</span>
          {localUnavailable && <span>{t("localUnavailable")}</span>}
          <span>
            <Kbd>↵</Kbd>
            {t("choose")}
            <Kbd>Esc</Kbd>
            {t("cancel")}
          </span>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
