import { requestLayerTransition } from "../transitions/requests";
import { useMobileLayout } from "../../workspace/mobile/use-mobile";
import { useState, type ReactElement } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motionTimeToSeconds, type EnginePort, type MotionAnimationPreset } from "@musart/core";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { TimelineIconButton } from "../ControlButton";
import type { TimelineTransport } from "../model";
import { captureTransitionOrigin, type TransitionOrigin } from "../transitions/authoring";
import { PresetPicker } from "./PresetPicker";
import { animationPresentation } from "./presentation";

export interface MotionPopoverProps {
  engine: EnginePort;
  compositionId: string;
  layerId: string;
  trackId?: string;
  transport: TimelineTransport;
  disabled?: boolean;
  initialOrigin?: TransitionOrigin;
  anchor?: ReactElement;
  onClose?: () => void;
  trigger?: ReactElement;
}
export function MotionPopover({
  engine,
  compositionId,
  layerId,
  trackId,
  transport,
  disabled,
  initialOrigin,
  anchor,
  onClose,
  trigger,
}: MotionPopoverProps) {
  const { t } = useTranslation("animations");
  const mobile = useMobileLayout();
  const [origin, setOrigin] = useState<TransitionOrigin | null>(initialOrigin ?? null);
  const [error, setError] = useState("");
  const open =
    !!origin && !disabled && origin.compositionId === compositionId && origin.layerId === layerId;
  function close() {
    setOrigin(null);
    onClose?.();
  }
  function apply(preset: MotionAnimationPreset) {
    if (!origin) return;
    const current = engine.getSnapshot();
    if (
      current.project !== origin.project ||
      current.revision !== origin.revision ||
      current.pageId !== origin.compositionId
    ) {
      setError("changed");
      return;
    }
    const track = current.project.pages
      .find((page) => page.id === compositionId)
      ?.motion?.tracks.find((track) => track.id === origin.trackId);
    if (!track) {
      setError("changed");
      return;
    }
    const visibleStart = Math.max(0, motionTimeToSeconds(track.start));
    const page = current.project.pages.find((page) => page.id === compositionId)!;
    const visibleEnd = Math.min(
      motionTimeToSeconds(track.end ?? page.motion!.duration),
      motionTimeToSeconds(page.motion!.duration),
    );
    const duration = Math.min(preset.duration, Math.floor((visibleEnd - visibleStart) * 1000));
    if (duration < 1) {
      setError("applyFailed");
      return;
    }
    const start = Math.max(
      visibleStart,
      Math.min(motionTimeToSeconds(transport.read().time), visibleEnd - duration / 1000),
    );
    try {
      engine.execute({
        type: "addMotionAnimation",
        trackId: origin.trackId,
        preset,
        start: { value: Math.round(start * 1000000), rate: 1000000 },
        duration: {
          value: duration,
          rate: 1000,
        },
      });
      const updated = engine
        .getSnapshot()
        .project.pages.find((page) => page.id === compositionId)
        ?.motion?.tracks.find((track) => track.id === origin.trackId);
      animationPresentation(engine).set({ selected: updated?.animations?.at(-1)?.id ?? null });
      close();
    } catch {
      setError("applyFailed");
    }
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
        transport.pause();
        const captured = captureTransitionOrigin(
          engine,
          compositionId,
          layerId,
          trackId,
          transport.read().time,
        );
        if (captured) setOrigin(captured);
        else
          void requestLayerTransition(engine, compositionId, layerId, undefined, trackId).catch(
            () => setError("applyFailed"),
          );
      }}
    >
      {anchor ? (
        <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          {trigger ?? (
            <TimelineIconButton label={t("add")} disabled={disabled}>
              <Sparkles size={13} />
            </TimelineIconButton>
          )}
        </PopoverTrigger>
      )}
      <PopoverContent
        className="motion-animation-popover"
        side={mobile ? "top" : "left"}
        align={mobile ? "end" : "start"}
        collisionPadding={12}
        aria-label={t("add")}
        data-canvas-control
        data-keybinding-capture
      >
        <PresetPicker engine={engine} apply={apply} />
        {error && <p role="alert">{t(error)}</p>}
      </PopoverContent>
    </Popover>
  );
}
