import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Sparkles } from "lucide-react";
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
import { PresetPreview } from "./PresetPreview";
import { ANIMATION_PREVIEW_IMAGE } from "./preview-document";
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
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
          setHovered(null);
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
      <div className="animation-categories" role="group" aria-label={t("title")}>
        {["all", ...ANIMATION_CATEGORIES].map((value) => (
          <Button
            key={value}
            size="xs"
            variant={category === value ? "secondary" : "ghost"}
            aria-pressed={category === value}
            onClick={() => {
              setCategory(value);
              setHovered(null);
            }}
          >
            {t(value === "all" ? "all" : `category.${value}`)}
          </Button>
        ))}
      </div>
      <div className="animation-preset-scroll">
        <div className="animation-preset-grid">
          {entries.map((preset) => (
            <div className="animation-preset-cell" key={preset.id}>
              <button
                className="animation-preset-card"
                type="button"
                aria-label={preset.name}
                onPointerEnter={(event) => {
                  setHovered(preset.id);
                  setMount(
                    event.currentTarget.querySelector<HTMLDivElement>(".animation-card-live"),
                  );
                }}
                onPointerLeave={() =>
                  setHovered((current) => (current === preset.id ? null : current))
                }
                onFocus={(event) => {
                  setHovered(preset.id);
                  setMount(
                    event.currentTarget.querySelector<HTMLDivElement>(".animation-card-live"),
                  );
                }}
                onBlur={() => setHovered((current) => (current === preset.id ? null : current))}
                onClick={() => apply(preset)}
              >
                <span className="animation-card-image">
                  <img src={ANIMATION_PREVIEW_IMAGE} alt="" loading="lazy" />
                  <div className="animation-card-live" aria-hidden />
                </span>
                <span className="animation-card-name">{preset.name}</span>
                <span className="animation-card-category">{t(`category.${preset.category}`)}</span>
              </button>
              {source === "mine" && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="animation-preset-delete"
                  disabled={busy}
                  aria-label={t("deletePreset")}
                  onClick={() => {
                    const record = saved.find((record) => record.id === preset.id);
                    if (record) void remove(record);
                  }}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          ))}
        </div>
        {!entries.length && (
          <p className="animation-picker-empty">
            {t(source === "mine" && !saved.length ? "emptyLibrary" : "noResults")}
          </p>
        )}
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
      </div>
      <PresetPreview
        engine={engine}
        preset={entries.find((preset) => preset.id === hovered)}
        mount={hovered ? mount : null}
        onError={previewError}
      />
      {error && <p role="alert">{t("failed")}</p>}
      <footer>{t("hover")}</footer>
    </div>
  );
}
