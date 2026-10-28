// Virtualized picker adapted from ResumI ShapePicker (MIT); see docs/legal/resumi-MIT.txt.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { createSearchIndex, loadAssets, type AssetKind, type CatalogAsset } from "@musart/assets";
import type { EnginePort } from "@musart/core";
import { importSvg } from "../../services/assets/vector/import-svg";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { SearchInput } from "./SearchInput";
import { PaletteVector } from "./PaletteVector";
import styles from "./Palette.module.css";
import "./messages";

type Category = AssetKind | "imported";
const EMPTY_ITEMS: readonly CatalogAsset[] = Object.freeze([]);
export function ShapePalette({
  engine,
  onChoose,
}: {
  engine: EnginePort;
  onChoose: (item: CatalogAsset) => void;
}) {
  const { t } = useTranslation("assets");
  const [category, setCategory] = useState<Category>("shapes");
  const [loaded, setLoaded] = useState<{
    category: AssetKind | null;
    items: readonly CatalogAsset[];
    error: string;
  }>({ category: null, items: [], error: "" });
  const [imported, setImported] = useState<CatalogAsset[]>(() => {
    const unique = new Map<string, CatalogAsset>();
    for (const page of engine.getSnapshot().project.pages)
      for (const layer of page.layers) {
        if (layer.vector?.attribution?.startsWith("Imported SVG:"))
          unique.set(JSON.stringify(layer.vector), {
            ...layer.vector,
            id: layer.id,
            name: layer.name,
          });
      }
    return [...unique.values()];
  });
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const items =
    category === "imported" ? imported : loaded.category === category ? loaded.items : EMPTY_ITEMS;
  const loading = category !== "imported" && loaded.category !== category;
  const failure = error || (loaded.category === category ? loaded.error : "");
  useEffect(() => {
    if (category === "imported") return;
    let active = true;
    void loadAssets(category).then(
      (items) => {
        if (active) setLoaded({ category, items, error: "" });
      },
      () => {
        if (active) setLoaded({ category, items: [], error: t("failed") });
      },
    );
    return () => {
      active = false;
    };
  }, [category, t]);
  const name = useCallback(
    (item: CatalogAsset) =>
      item.id.startsWith("gallery-")
        ? t("gallery", { number: item.id.slice(8) })
        : t(`names.${item.id}`, { defaultValue: item.name }),
    [t],
  );
  const index = useMemo(
    () =>
      createSearchIndex(items, {
        text: (item) => `${name(item)} ${item.name}`,
        keywords: (item) => item.category ?? "",
      }),
    [items, name],
  );
  const filtered = index.search(query, { limit: items.length });
  const firstRow = Math.max(0, Math.floor(scrollTop / 51) - 1);
  const visible = filtered.slice(firstRow * 5, (firstRow + 8) * 5);
  function resetScroll() {
    setScrollTop(0);
    if (scroll.current) scroll.current.scrollTop = 0;
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > 256000) {
      setError(t("svgTooLarge"));
      return;
    }
    try {
      const item = importSvg(await file.text(), file.name);
      setImported((current) => [
        ...current.filter((prior) => JSON.stringify(prior.parts) !== JSON.stringify(item.parts)),
        item,
      ]);
      setCategory("imported");
      setQuery("");
      resetScroll();
    } catch {
      setError(t("svgFailed"));
    }
  }
  return (
    <div className={styles.picker}>
      <header>
        <strong>{t("title")}</strong>
        <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
          <Upload size={14} aria-hidden />
          {t("import")}
        </Button>
      </header>
      <ButtonGroup className={styles.categories} aria-label={t("title")}>
        {(["shapes", "icons", "brands", "imported"] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            aria-pressed={category === kind}
            onClick={() => {
              setCategory(kind);
              setQuery("");
              setError("");
              resetScroll();
            }}
          >
            {t(kind)}
          </Button>
        ))}
      </ButtonGroup>
      <div className={styles.search}>
        <SearchInput
          aria-label={t("search")}
          prefix={t("search")}
          autoFocus
          captureTyping
          focusKey={category}
          value={query}
          hints={items
            .slice(0, 6)
            .map((item) => ({ label: name(item), preview: <PaletteVector item={item} /> }))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && filtered[0] && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onChoose({ ...filtered[0], name: name(filtered[0]) });
            }
          }}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            resetScroll();
          }}
        />
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/svg+xml,.svg"
        aria-label={t("import")}
        onChange={(event) => {
          void importFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {failure && (
        <p role="alert" className={styles.error}>
          {failure}
        </p>
      )}
      <ScrollShadow>
        <div
          ref={scroll}
          className={styles.scroller}
          role="region"
          aria-label={t(category)}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          {loading ? (
            <p className={styles.empty}>{t("loading")}</p>
          ) : (
            <>
              <div
                className={styles.shapeSpace}
                style={{ height: Math.ceil(filtered.length / 5) * 51 + 15 }}
              >
                <div className={styles.shapeGrid} style={{ top: firstRow * 51 }}>
                  {visible.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      title={name(item)}
                      aria-label={t("use", { name: name(item) })}
                      onClick={() => onChoose({ ...item, name: name(item) })}
                    >
                      <PaletteVector item={item} />
                    </button>
                  ))}
                </div>
              </div>
              {!filtered.length && <p className={styles.empty}>{t("empty")}</p>}
              {!!filtered.length && (
                <small className={styles.count}>{t("results", { count: filtered.length })}</small>
              )}
            </>
          )}
        </div>
      </ScrollShadow>
      <p className={styles.hint}>{t("hint")}</p>
    </div>
  );
}
