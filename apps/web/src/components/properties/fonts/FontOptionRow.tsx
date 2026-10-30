import { memo, useLayoutEffect, useState, type PointerEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FontOption } from "./catalog";
import type { FontSampleCache, FontSampleState } from "./sample-cache";
import styles from "./FontPicker.module.css";
import "./messages";

export const FontOptionRow = memo(function FontOptionRow({
  font,
  index,
  id,
  selected,
  applied,
  active,
  count,
  installed,
  visible,
  cache,
  onIntent,
  onLeave,
  onFocusFont,
  onChoose,
}: {
  font: FontOption;
  index: number;
  id: string;
  selected: boolean;
  applied: boolean;
  active: boolean;
  count: number;
  installed: boolean;
  visible: boolean;
  cache: FontSampleCache;
  onIntent: (font: FontOption, index: number) => void;
  onLeave: () => void;
  onFocusFont: (font: FontOption, index: number) => void;
  onChoose: (font: FontOption) => void;
}) {
  const { t } = useTranslation("fonts");
  const [storedSample, setSample] = useState<FontSampleState>({ status: "loading" });
  const sample: FontSampleState = visible ? storedSample : { status: "loading" };
  useLayoutEffect(
    () => (visible ? cache.acquire(font, installed, setSample) : undefined),
    [cache, font, installed, visible],
  );
  function intent(event: PointerEvent) {
    if (event.pointerType !== "touch") onIntent(font, index);
  }
  return (
    <button
      type="button"
      role="option"
      id={id}
      aria-label={font.label ?? font.family}
      aria-selected={selected}
      aria-setsize={count}
      aria-posinset={index + 1}
      aria-busy={visible && sample.status === "loading"}
      tabIndex={-1}
      className={styles.row}
      data-active={active || undefined}
      onPointerEnter={intent}
      onPointerMove={intent}
      onPointerLeave={onLeave}
      onFocus={() => onFocusFont(font, index)}
      onClick={() => onChoose(font)}
    >
      <span className={styles.rowHeading}>
        <span className={styles.name}>{font.label ?? font.family}</span>
        <small>{t(`category.${font.category}`)}</small>
        {applied && <Check size={14} aria-hidden data-font-applied />}
      </span>
      <span className={styles.sample} data-font-preview-state={sample.status} aria-hidden>
        {sample.status === "ready" ? (
          <span style={{ fontFamily: `"${sample.family}"` }}>{t("sample")}</span>
        ) : sample.status === "loading" ? (
          <>
            <LoaderCircle size={13} className="animate-spin" />
            <span>{t("sampleLoading")}</span>
          </>
        ) : (
          <span>{t("sampleUnavailable")}</span>
        )}
      </span>
    </button>
  );
});
