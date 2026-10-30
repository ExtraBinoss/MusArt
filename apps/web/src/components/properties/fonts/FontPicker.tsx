import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FONT_CATALOG, MAX_FONT_FILE_BYTES, createSearchIndex } from "@musart/assets";
import type { EnginePort, Layer } from "@musart/core";
import type { FontLibraryPort } from "../../../services/fonts/model";
import type { PropertyActions } from "../TextProperties";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { HorizontalScroll } from "../../shared/scroll/HorizontalScroll";
import { DropdownChevron } from "../../shared/DropdownChevron";
import { FontPickerSearch } from "./FontPickerSearch";
import {
  readRecentFonts,
  rememberFont,
  findFont,
  mergeFontOptions as mergeFonts,
  type FontOption,
} from "./catalog";
import { invalidateFontMetadata, loadFontMetadata, peekFontMetadata } from "./metadata";
import { bundledFontLibrary, useFontLibrary } from "./library-context";
import { FontSampleCache } from "./sample-cache";
import { FontOptionRow } from "./FontOptionRow";
import { FontRenderIndicator, FontRenderStatus } from "./FontRenderStatus";
import { FontCategoryTabs, type FontCategory } from "./FontCategoryTabs";
import { useFontCanvasStatus } from "./canvas-status";
import { createMotionTransport } from "../../../services/motion/transport";
import styles from "./FontPicker.module.css";
import "./messages";

const ROW_HEIGHT = 80,
  VIEW_ROWS = 4,
  OVERSCAN = 2;
const declinedDiscovery = new WeakSet<FontLibraryPort>();
const discoveries = new WeakMap<FontLibraryPort, Promise<readonly FontOption[]>>();

/** A bounded list previews through the same imperative path as numeric and color edits. */
export function FontPicker({
  layer,
  engine,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer; engine?: EnginePort }) {
  const { t } = useTranslation("fonts"),
    { t: common } = useTranslation();
  const library = useFontLibrary();
  const samples = useMemo(() => new FontSampleCache(library), [library]);
  const canvas = useFontCanvasStatus(engine);
  const { request: requestCanvas, cancel: cancelCanvas } = canvas;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [windowRow, setWindowRow] = useState(0);
  const scrollPosition = useRef(0),
    hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pointerFont = useRef<string | null>(null),
    pointerBlockedUntil = useRef(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [category, setCategory] = useState<FontCategory>("all");
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
  const filtered = useMemo(
    () =>
      search?.search(query, {
        limit: fonts.length,
        filter: (font) =>
          category === "all" ||
          (category === "installed" ? installedIds.has(font.id) : font.category === category),
      }) ?? [],
    [search, query, category, installedIds, fonts.length],
  );
  const hints = useMemo(
    () => fonts.slice(0, 6).map((font) => ({ label: font.label ?? font.family })),
    [fonts],
  );
  const first = Math.min(Math.max(0, windowRow - OVERSCAN), Math.max(0, filtered.length - 1));
  const visible = filtered.slice(first, first + VIEW_ROWS + OVERSCAN * 2);
  useLayoutEffect(() => {
    cancelRef.current = cancel;
    latest.current = layer;
    latestLibrary.current = library;
  }, [cancel, layer, library]);
  const attachList = useCallback((node: HTMLDivElement | null) => {
    list.current = node;
    if (node) {
      node.scrollTop = scrollPosition.current;
      scrollPosition.current = node.scrollTop;
      setWindowRow(Math.floor(node.scrollTop / ROW_HEIGHT));
    }
  }, []);
  const clearIntent = useCallback(() => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = undefined;
    pointerFont.current = null;
  }, []);
  useEffect(() => () => samples.dispose(), [samples]);
  useEffect(() => {
    if (open) samples.resume();
    else samples.pause();
  }, [samples, open]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearIntent();
      if (activePreview.current) cancelRef.current();
    };
  }, [clearIntent]);
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

  const resetPreview = useCallback(() => {
    if (!activePreview.current) return;
    activePreview.current = false;
    previewFamily.current = null;
    cancelCanvas(true);
    cancel();
  }, [cancel, cancelCanvas]);
  function scrollTo(top: number) {
    scrollPosition.current = top;
    if (list.current) {
      list.current.scrollTop = top;
      scrollPosition.current = list.current.scrollTop;
    }
    setWindowRow(Math.floor(scrollPosition.current / ROW_HEIGHT));
  }
  function show(value: boolean) {
    if (value && layer.locked) return;
    if (value && engine) createMotionTransport(engine).pause();
    request.current++;
    clearIntent();
    setPending(null);
    if (!value) {
      resetPreview();
      samples.pause();
    } else {
      samples.resume();
      setMetadataReady(false);
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
      scrollTo(
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
  const previewFont = useCallback(
    (font: FontOption, index?: number) => {
      if (layer.locked || pending) return;
      if (index !== undefined) setActive(index);
      if (previewFamily.current === font.family) return;
      activePreview.current = true;
      previewFamily.current = font.family;
      requestCanvas(
        { fontId: font.id, layerId: layer.id, family: font.family, weight: layer.fontWeight },
        font.label ?? font.family,
        "preview",
      );
      preview({ fontFamily: font.family });
    },
    [layer.locked, layer.id, layer.fontWeight, pending, preview, requestCanvas],
  );
  const intent = useCallback(
    (font: FontOption, index: number) => {
      if (performance.now() < pointerBlockedUntil.current || pointerFont.current === font.id)
        return;
      clearIntent();
      pointerFont.current = font.id;
      const version = request.current,
        origin = latest.current;
      hoverTimer.current = setTimeout(() => {
        hoverTimer.current = undefined;
        if (
          alive.current &&
          request.current === version &&
          latestLibrary.current === library &&
          latest.current.id === origin.id &&
          latest.current.fontFamily === origin.fontFamily &&
          latest.current.fontWeight === origin.fontWeight &&
          !latest.current.locked
        )
          previewFont(font, index);
      }, 120);
    },
    [clearIntent, library, previewFont],
  );
  const suspendPointer = useCallback(() => {
    pointerBlockedUntil.current = performance.now() + 150;
    clearIntent();
    resetPreview();
  }, [clearIntent, resetPreview]);
  function apply(font: FontOption) {
    resetPreview();
    if (font.family !== layer.fontFamily) patch({ fontFamily: font.family });
    requestCanvas(
      { fontId: font.id, layerId: layer.id, family: font.family, weight: layer.fontWeight },
      font.label ?? font.family,
      "commit",
    );
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
      scrollPosition.current = list.current.scrollTop;
      setWindowRow(Math.floor(list.current.scrollTop / ROW_HEIGHT));
    }
    previewFont(filtered[next]!, next);
  }
  const handlers = useRef({ choose, previewFont });
  useLayoutEffect(() => {
    handlers.current = { choose, previewFont };
  });
  const chooseRow = useCallback((font: FontOption) => handlers.current.choose(font), []);
  const focusRow = useCallback(
    (font: FontOption, index: number) => handlers.current.previewFont(font, index),
    [],
  );
  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={common("fontFamily")}
          aria-expanded={open}
          aria-busy={canvas.view?.status === "pending"}
          data-font-render-status={canvas.view?.status ?? "idle"}
          data-font-render-family={canvas.view?.ticket?.family}
          data-font-render-generation={canvas.view?.ticket?.sequence}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          disabled={layer.locked}
          className={styles.trigger}
        >
          <span>{currentLabel}</span>
          <FontRenderIndicator state={canvas.view} />
          <DropdownChevron size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className={`floating-panel ${styles.popover}`}>
        <div className={styles.header}>
          <strong>{t("title")}</strong>
          <span>
            {metadataReady ? (
              fonts.length
            ) : (
              <LoaderCircle size={12} className="animate-spin" aria-label={t("loading")} />
            )}
          </span>
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
        <FontPickerSearch
          id={`${id}-font-search`}
          listId={listId}
          activeId={
            active >= 0 && filtered[active] ? `${id}-font-${filtered[active]!.id}` : undefined
          }
          hints={hints}
          query={query}
          onMove={move}
          onQuery={(value) => {
            request.current++;
            clearIntent();
            setPending(null);
            resetPreview();
            setQuery(value);
            setActive(-1);
            scrollTo(0);
          }}
          onChoose={() => {
            const font = filtered[Math.max(0, active)];
            if (font) choose(font);
          }}
        />
        <FontCategoryTabs
          value={category}
          onChange={(item) => {
            request.current++;
            clearIntent();
            setPending(null);
            resetPreview();
            setCategory(item);
            setActive(-1);
            scrollTo(0);
          }}
        />
        {!query && recent.length > 0 && (
          <div className={styles.recents}>
            <span>{t("recent")}</span>
            <HorizontalScroll label={t("recent")}>
              {recent.map((item) => {
                const font = fonts.find((font) => font.id === item);
                return font ? (
                  <button
                    type="button"
                    key={item}
                    onPointerEnter={() => intent(font, -1)}
                    onPointerLeave={clearIntent}
                    onFocus={() => previewFont(font)}
                    onClick={() => choose(font)}
                  >
                    {font.label ?? font.family}
                  </button>
                ) : null;
              })}
            </HorizontalScroll>
          </div>
        )}
        <ScrollShadow className={styles.listShadow}>
          <div
            ref={attachList}
            id={listId}
            role="listbox"
            aria-label={t("title")}
            className={styles.list}
            style={{ height: ROW_HEIGHT * VIEW_ROWS }}
            onWheelCapture={suspendPointer}
            onPointerDownCapture={(event) => {
              if (event.pointerType === "touch" || event.target === event.currentTarget)
                suspendPointer();
            }}
            onScroll={(event) => {
              scrollPosition.current = event.currentTarget.scrollTop;
              setWindowRow(Math.floor(event.currentTarget.scrollTop / ROW_HEIGHT));
            }}
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
                    <FontOptionRow
                      key={font.id}
                      font={font}
                      index={index}
                      id={`${id}-font-${font.id}`}
                      selected={active >= 0 ? active === index : current?.id === font.id}
                      applied={current?.id === font.id}
                      active={active === index}
                      count={filtered.length}
                      installed={installedIds.has(font.id)}
                      visible={index >= windowRow && index < windowRow + VIEW_ROWS + 1}
                      cache={samples}
                      onIntent={intent}
                      onLeave={clearIntent}
                      onFocusFont={focusRow}
                      onChoose={chooseRow}
                    />
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
        <FontRenderStatus state={canvas.view} />
        {localUnavailable && library.supportsLocalFonts && (
          <p className={styles.status}>{t("localUnavailable")}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
