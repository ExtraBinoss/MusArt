import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import type { Effect, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { startEffectPreview } from "../../../state/session/effect-preview";
import "./messages";

export function EffectPlayback({
  engine,
  effect,
  disabled,
  onChange,
  onStart,
  onCancel,
}: {
  engine: EnginePort;
  effect: Effect;
  disabled: boolean;
  onChange(this: void, patch: Partial<Effect>, preview?: boolean): void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    output = useRef<HTMLOutputElement>(null);
  const finish = useRef<((commit?: boolean) => void) | null>(null);
  useEffect(() => {
    const pointer = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) finish.current?.();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && finish.current) {
        event.preventDefault();
        event.stopPropagation();
        finish.current(false);
      } else if (!root.current?.contains(event.target as Node)) finish.current?.();
    };
    const hide = () => {
      if (document.hidden) finish.current?.();
    };
    const blur = () => finish.current?.();
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hide);
      finish.current?.(false);
    };
  }, []);
  return (
    <div ref={root} className="effect-playback">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        aria-pressed={playing}
        onClick={() => {
          if (finish.current) {
            finish.current();
            return;
          }
          setPlaying(true);
          finish.current = startEffectPreview(engine, {
            time: effect.time ?? 0,
            clock: {
              now: () => performance.now(),
              request: (cb) => requestAnimationFrame(cb),
              cancel: (id) => cancelAnimationFrame(id),
            },
            begin: () => onStart?.(),
            preview: (time) => {
              if (output.current) output.current.value = `${time.toFixed(2)} s`;
              onChange({ time }, true);
            },
            commit: (time) => onChange({ time }),
            cancel: () => {
              if (output.current) output.current.value = `${(effect.time ?? 0).toFixed(2)} s`;
              onCancel?.();
            },
            stopped: () => {
              finish.current = null;
              setPlaying(false);
            },
          });
        }}
      >
        {playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
        {t(playing ? "effectControls:pauseLive" : "effectControls:playLive")}
      </Button>
      <output ref={output} aria-label={t("effectControls:liveTime")}>
        {(effect.time ?? 0).toFixed(2)} s
      </output>
    </div>
  );
}
