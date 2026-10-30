import { useMemo, useState, type ReactElement } from "react";
import { Blend } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createMotionEasingPreset,
  motionTimeToSeconds,
  TRANSITION_CATALOG,
  TRANSITION_CATEGORIES,
  type EnginePort,
  type TransitionCategory,
  type TransitionStyle,
} from "@musart/core";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { TimelineIconButton } from "../ControlButton";
import { SelectField } from "../../shared/SelectField";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import type { TimelineTransport } from "../model";
import { captureTransitionOrigin, commitTransition, type TransitionOrigin } from "./authoring";
import { TransitionPreview } from "./TransitionPreview";
import { createTransitionPreviewSource } from "./preview-source";
import "./messages";
import "./transitions.css";

/** Small, layer-scoped authoring UI; the document stores standard effect/keyframe channels. */
export function TransitionPopover({
  engine,
  compositionId,
  layerId,
  trackId,
  transport,
  disabled = false,
  initialOrigin,
  anchor,
  onClose,
}: {
  engine: EnginePort;
  compositionId: string;
  layerId: string;
  trackId?: string;
  transport: TimelineTransport;
  disabled?: boolean;
  initialOrigin?: TransitionOrigin;
  anchor?: ReactElement;
  onClose?: () => void;
}) {
  const { t } = useTranslation("transitions");
  const [origin, setOrigin] = useState<TransitionOrigin | null>(initialOrigin ?? null);
  const [category, setCategory] = useState<TransitionCategory>("fade");
  const [style, setStyle] = useState<TransitionStyle>("fade");
  const [placement, setPlacement] = useState<"in" | "out">("in");
  const preview = useMemo(() => createTransitionPreviewSource(), []);
  const [duration, setDuration] = useState(() =>
    initialOrigin
      ? String(
          Math.max(1, Math.min(500, Math.floor(motionTimeToSeconds(initialOrigin.span) * 1000))),
        )
      : "500",
  );
  const [error, setError] = useState("");
  if (origin && (disabled || origin.compositionId !== compositionId || origin.layerId !== layerId))
    setOrigin(null);
  const open =
    !!origin && !disabled && origin.compositionId === compositionId && origin.layerId === layerId;
  function close() {
    preview.set(null);
    setOrigin(null);
    onClose?.();
  }
  function showPreview(style: TransitionStyle | null) {
    const current = engine.getSnapshot();
    preview.set(
      origin &&
        current.project === origin.project &&
        current.revision === origin.revision &&
        current.pageId === origin.compositionId
        ? style
        : null,
    );
  }
  function apply() {
    if (!origin || !open) return;
    const value = Number(duration);
    if (!duration.trim() || !Number.isSafeInteger(value) || value <= 0) {
      setError("invalid");
      return;
    }
    const result = commitTransition(engine, origin, {
      style,
      placement,
      duration: { value, rate: 1000 },
      easing: createMotionEasingPreset("easeInOut"),
    });
    if (result === "applied") close();
    else setError(result);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setError("");
        if (!next) {
          close();
          return;
        }
        preview.set(null);
        transport.pause();
        const captured = captureTransitionOrigin(
          engine,
          compositionId,
          layerId,
          trackId,
          transport.read().time,
        );
        if (!captured) return;
        setDuration(
          String(Math.max(1, Math.min(500, Math.floor(motionTimeToSeconds(captured.span) * 1000)))),
        );
        setOrigin(captured);
      }}
    >
      {anchor ? (
        <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <TimelineIconButton
            className="motion-transition-trigger"
            label={t("add")}
            disabled={disabled}
          >
            <Blend size={12} />
          </TimelineIconButton>
        </PopoverTrigger>
      )}
      <PopoverContent
        className="motion-transition-popover"
        side="top"
        align="start"
        aria-label={t("title")}
        data-canvas-control
        data-keybinding-capture
      >
        <header>
          <strong>{t("title")}</strong>
          <span>{t("count", { count: TRANSITION_CATALOG.length })}</span>
        </header>
        <SegmentedTabs
          mode="choice"
          size="compact"
          value={placement}
          label={t("placement")}
          items={[
            { value: "in", label: t("in") },
            { value: "out", label: t("out") },
          ]}
          onValueChange={(value) => {
            if (value === "in" || value === "out") setPlacement(value);
          }}
        />
        <SelectField
          label={t("categoryLabel")}
          value={category}
          side="bottom"
          identity={origin}
          options={TRANSITION_CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))}
          onPreview={(value) =>
            showPreview(TRANSITION_CATALOG.find((entry) => entry.category === value)?.id ?? null)
          }
          onPreviewCancel={() => preview.set(null)}
          onValueChange={(value) => {
            const first = TRANSITION_CATALOG.find((entry) => entry.category === value);
            if (first) {
              setCategory(first.category);
              setStyle(first.id);
              preview.set(null);
            }
          }}
        />
        <SelectField
          label={t("operator")}
          value={style}
          side="bottom"
          identity={origin}
          options={TRANSITION_CATALOG.filter((entry) => entry.category === category).map(
            (entry) => ({ value: entry.id, label: t(entry.labelKey) }),
          )}
          onPreview={(value) =>
            showPreview(
              TRANSITION_CATALOG.find((entry) => entry.id === value && entry.category === category)
                ?.id ?? null,
            )
          }
          onPreviewCancel={() => preview.set(null)}
          onValueChange={(value) => {
            const selected = TRANSITION_CATALOG.find(
              (entry) => entry.id === value && entry.category === category,
            );
            if (selected) {
              setStyle(selected.id);
              preview.set(null);
            }
          }}
        />
        {open && origin && (
          <TransitionPreview
            engine={engine}
            origin={origin}
            style={style}
            previewSource={preview}
            placement={placement}
            duration={Number(duration)}
            optionActive={false}
          />
        )}
        <Label className="motion-transition-duration">
          {t("duration")}
          <span>
            <Input
              aria-label={t("duration")}
              value={duration}
              type="number"
              min={1}
              step={1}
              max={origin ? Math.floor(motionTimeToSeconds(origin.span) * 1000) : undefined}
              onChange={(event) => setDuration(event.target.value)}
            />
            <span>ms</span>
          </span>
        </Label>
        <p>{t("hint")}</p>
        {error && <p role="alert">{t(error)}</p>}
        <footer>
          <Button variant="ghost" size="sm" onClick={close}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={apply}>
            {t("apply")}
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
