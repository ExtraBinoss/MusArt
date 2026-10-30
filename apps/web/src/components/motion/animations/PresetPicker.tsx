import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ANIMATION_CATEGORIES,
  MOTION_ANIMATION_PRESETS,
  type EnginePort,
  type MotionAnimationPreset,
} from "@musart/core";
import {
  MotionPresetStore,
  type SavedMotionPreset,
} from "../../../services/motion/animations/presets";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { PresetGrid } from "./PresetGrid";
import { HorizontalScroll } from "../../shared/scroll/HorizontalScroll";
import "./messages";
import "./animations.css";

export function PresetPicker({
  engine,
  apply,
}: {
  engine: EnginePort;
  apply: (preset: MotionAnimationPreset) => void;
}) {
  const { t } = useTranslation("animations");
  const loadMore = useRef<HTMLButtonElement>(null);
  const [source, setSource] = useState("library");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<SavedMotionPreset[]>([]);
  const [before, setBefore] = useState<[number, string] | null>(null);
  const [store, setStore] = useState<MotionPresetStore | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewError = useCallback(() => setError(true), []);
  useEffect(() => {
    if (source !== "mine") return;
    const owner = new MotionPresetStore();
    let alive = true;
    void owner.list().then(
      (page) => {
        if (alive) {
          setStore(owner);
          setSaved(page.items);
          setBefore(page.before);
        }
      },
      () => {
        if (alive) setError(true);
      },
    );
    return () => {
      alive = false;
      owner.dispose();
    };
  }, [source]);
  const entries = useMemo(
    () =>
      (source === "library"
        ? MOTION_ANIMATION_PRESETS
        : saved.map((record) => record.preset)
      ).filter(
        (preset) =>
          (category === "all" || preset.category === category) &&
          `${preset.name} ${t(`category.${preset.category}`)}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [source, saved, category, query, t],
  );
  async function more() {
    if (!before || !store || busy) return;
    setBusy(true);
    try {
      const page = await store.list(before);
      setSaved((current) => [...current, ...page.items]);
      setBefore(page.before);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(record: SavedMotionPreset) {
    if (!store || busy) return;
    setBusy(true);
    try {
      await store.delete(record);
      setSaved((current) => current.filter((item) => item.id !== record.id));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const button = loadMore.current;
    if (!button || busy || source !== "mine" || !before) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) button.click();
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [before, busy, source]);
  return (
    <div className="animation-picker">
      <header>
        <strong>
          <Sparkles size={14} />
          {t("add")}
        </strong>
        <span>
          {t("count", {
            count: source === "library" ? MOTION_ANIMATION_PRESETS.length : saved.length,
          })}
        </span>
      </header>
      <SegmentedTabs
        mode="choice"
        size="compact"
        label={t("title")}
        value={source}
        items={[
          { value: "library", label: t("library") },
          { value: "mine", label: t("mine") },
        ]}
        onValueChange={(value) => {
          setSource(value);
          setCategory("all");
        }}
      />
      <label className="animation-search">
        <Search size={14} />
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <HorizontalScroll label={t("categories")} className="animation-category-strip">
        <div className="animation-categories">
          {["all", ...ANIMATION_CATEGORIES].map((value) => (
            <Button
              key={value}
              size="xs"
              variant={category === value ? "secondary" : "ghost"}
              aria-pressed={category === value}
              onClick={() => {
                setCategory(value);
              }}
            >
              {t(value === "all" ? "all" : `category.${value}`)}
            </Button>
          ))}
        </div>
      </HorizontalScroll>
      <PresetGrid
        key={`${source}:${category}:${query}`}
        engine={engine}
        entries={entries}
        apply={apply}
        busy={busy}
        onError={previewError}
        empty={t(source === "mine" && !saved.length ? "emptyLibrary" : "noResults")}
        remove={
          source === "mine"
            ? (id) => {
                const record = saved.find((record) => record.id === id);
                if (record) void remove(record);
              }
            : undefined
        }
      >
        {source === "mine" && before && (
          <Button
            ref={loadMore}
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void more()}
          >
            {t("more")}
          </Button>
        )}
      </PresetGrid>
      {error && <p role="alert">{t("failed")}</p>}
    </div>
  );
}
