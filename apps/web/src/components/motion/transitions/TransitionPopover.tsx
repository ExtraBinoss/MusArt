import { useMemo, useState, type ReactElement } from "react";
import { Blend } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createMotionEasingPreset,
  motionTimeToSeconds,
  type EnginePort,
  type TransitionCategory,
  type TransitionStyle,
} from "@musart/core";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { TimelineIconButton } from "../ControlButton";
import type { TimelineTransport } from "../model";
import { captureTransitionOrigin, commitTransition, type TransitionOrigin } from "./authoring";
import { createTransitionPreviewSource } from "./preview-source";
import { TransitionForm } from "./TransitionForm";
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
        <TransitionForm
          engine={engine}
          model={{
            active: open,
            origin,
            category,
            style,
            placement,
            duration,
            error,
            previewSource: preview,
          }}
          actions={{
            setPlacement,
            setDuration,
            preview: showPreview,
            clearPreview: () => preview.set(null),
            cancel: close,
            apply,
            selectCategory: (category, firstStyle) => {
              setCategory(category);
              setStyle(firstStyle);
              preview.set(null);
            },
            selectStyle: (value) => {
              setStyle(value);
              preview.set(null);
            },
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
