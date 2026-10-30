import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  motionTimeToSeconds,
  TRANSITION_CATALOG,
  TRANSITION_CATEGORIES,
  type EnginePort,
  type TransitionCategory,
  type TransitionStyle,
} from "@musart/core";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { SelectField } from "../../shared/SelectField";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { TransitionPreview } from "./TransitionPreview";
import type { TransitionOrigin } from "./authoring";
import type { TransitionPreviewSource } from "./preview-source";
import "./messages";

export interface TransitionFormModel {
  active: boolean;
  origin: TransitionOrigin | null;
  category: TransitionCategory;
  style: TransitionStyle;
  placement: "in" | "out";
  duration: string;
  error: string;
  previewSource: TransitionPreviewSource;
}
export interface TransitionFormActions {
  setPlacement(this: void, value: "in" | "out"): void;
  selectCategory(this: void, category: TransitionCategory, firstStyle: TransitionStyle): void;
  selectStyle(this: void, style: TransitionStyle): void;
  setDuration(this: void, value: string): void;
  preview(this: void, style: TransitionStyle | null): void;
  clearPreview(this: void): void;
  cancel(this: void): void;
  apply(this: void): void;
}

/** Radix mounts this actual form only while its content is present, including the exit animation. */
export function TransitionForm({
  engine,
  model,
  actions,
}: {
  engine: EnginePort;
  model: TransitionFormModel;
  actions: TransitionFormActions;
}) {
  const { t } = useTranslation("transitions");
  const categories = useMemo(
    () => TRANSITION_CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) })),
    [t],
  );
  const styles = useMemo(
    () =>
      TRANSITION_CATALOG.filter((entry) => entry.category === model.category).map((entry) => ({
        value: entry.id,
        label: t(entry.labelKey),
      })),
    [t, model.category],
  );
  return (
    <>
      <header>
        <strong>{t("title")}</strong>
        <span>{t("count", { count: TRANSITION_CATALOG.length })}</span>
      </header>
      <SegmentedTabs
        mode="choice"
        size="compact"
        value={model.placement}
        label={t("placement")}
        items={[
          { value: "in", label: t("in") },
          { value: "out", label: t("out") },
        ]}
        onValueChange={(value) => {
          if (value === "in" || value === "out") actions.setPlacement(value);
        }}
      />
      <SelectField
        label={t("categoryLabel")}
        value={model.category}
        side="bottom"
        identity={model.origin}
        options={categories}
        onPreview={(value) =>
          actions.preview(TRANSITION_CATALOG.find((entry) => entry.category === value)?.id ?? null)
        }
        onPreviewCancel={() => actions.clearPreview()}
        onValueChange={(value) => {
          const first = TRANSITION_CATALOG.find((entry) => entry.category === value);
          if (first) {
            actions.selectCategory(first.category, first.id);
          }
        }}
      />
      <SelectField
        label={t("operator")}
        value={model.style}
        side="bottom"
        identity={model.origin}
        options={styles}
        onPreview={(value) =>
          actions.preview(
            TRANSITION_CATALOG.find(
              (entry) => entry.id === value && entry.category === model.category,
            )?.id ?? null,
          )
        }
        onPreviewCancel={() => actions.clearPreview()}
        onValueChange={(value) => {
          const selected = TRANSITION_CATALOG.find(
            (entry) => entry.id === value && entry.category === model.category,
          );
          if (selected) {
            actions.selectStyle(selected.id);
          }
        }}
      />
      {model.active && model.origin && (
        <TransitionPreview
          engine={engine}
          origin={model.origin}
          style={model.style}
          previewSource={model.previewSource}
          placement={model.placement}
          duration={Number(model.duration)}
          optionActive={false}
        />
      )}
      <Label className="motion-transition-duration">
        {t("duration")}
        <span>
          <Input
            aria-label={t("duration")}
            value={model.duration}
            type="number"
            min={1}
            step={1}
            max={
              model.origin ? Math.floor(motionTimeToSeconds(model.origin.span) * 1000) : undefined
            }
            onChange={(event) => actions.setDuration(event.target.value)}
          />
          <span>ms</span>
        </span>
      </Label>
      <p>{t("hint")}</p>
      {model.error && <p role="alert">{t(model.error)}</p>}
      <footer>
        <Button variant="ghost" size="sm" onClick={actions.cancel}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={actions.apply}>
          {t("apply")}
        </Button>
      </footer>
    </>
  );
}
