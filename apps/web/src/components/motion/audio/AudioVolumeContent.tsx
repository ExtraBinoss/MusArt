import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Volume2, VolumeX } from "lucide-react";
import { resolveMotionAudioProcessing, type EnginePort, type MotionAudioTrack } from "@musart/core";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { PopoverContent } from "../../ui/popover";
import { Slider } from "../../ui/slider";
import { Input } from "../../ui/input";
import { TimelineIconButton } from "../ControlButton";
import { useVolumePreview } from "./use-volume-preview";
import { captureAudioTrackScope, type AudioTrackScope } from "./scope";
import "./messages";

/** Shared right-click and speaker popover, explicitly 0–100%, using the app's glass slider. */
export function AudioVolumeContent({
  engine,
  track,
  scope: providedScope,
}: {
  engine: EnginePort;
  track: MotionAudioTrack;
  scope?: AudioTrackScope;
}) {
  const { t } = useTranslation("motionAudio"),
    service = getMotionAudioSession(engine);
  const [ownScope] = useState(() => captureAudioTrackScope(engine, track));
  const scope = providedScope ?? ownScope;
  useEffect(
    () =>
      engine.subscribe(() => {
        scope.read();
      }),
    [engine, scope],
  );
  const { reset, output, input, slider, changed, preview, commit, cancel } = useVolumePreview(
    engine,
    track,
    scope.read,
  );
  const [error, setError] = useState("");
  useEffect(() => () => service?.stopPreview(track.id), [service, track.id]);
  return (
    <PopoverContent
      className="motion-audio-volume"
      side="top"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerCancelCapture={() => cancel()}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <div className="motion-audio-volume-main">
        <span>{t("volume")}</span>
        <Slider
          key={reset.epoch}
          aria-label={t("volume")}
          min={0}
          max={100}
          step={1}
          valueSource={slider}
          onValueChange={(values) => preview((values[0] ?? 100) / 100)}
          onValueCommit={(values) => commit((values[0] ?? 100) / 100)}
        />
        <output ref={output}>{Math.round(reset.value * 100)}%</output>
      </div>
      <div className="motion-audio-volume-actions">
        <Input
          ref={input}
          key={`input-${reset.epoch}`}
          aria-label={t("volumePercent")}
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={Math.round(reset.value * 100)}
          onChange={(event) => {
            if (event.currentTarget.value.trim())
              preview(Number(event.currentTarget.value) / 100, false);
          }}
          onBlur={(event) => {
            const value = Number(event.currentTarget.value);
            if (event.currentTarget.value.trim() && value >= 0 && value <= 100) commit(value / 100);
            else cancel();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <TimelineIconButton
          label={t(track.mute ? "unmute" : "mute", { name: track.name })}
          aria-pressed={track.mute}
          onClick={() => {
            const current = scope.read();
            if (current)
              engine.execute({
                type: "updateMotionAudioTrack",
                trackId: current.id,
                patch: { mute: !current.mute },
              });
          }}
        >
          {track.mute ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </TimelineIconButton>
        <TimelineIconButton
          disabled={!service}
          label={t("audition")}
          onClick={() => {
            if (!scope.read()) return;
            setError("");
            void service
              ?.previewTrack(
                track.id,
                resolveMotionAudioProcessing(track.processing),
                reset.value,
                "gain",
              )
              .catch((failure: unknown) => {
                if (!(failure instanceof DOMException && failure.name === "AbortError"))
                  setError(failure instanceof Error ? failure.message : t("processingFailed"));
              });
          }}
        >
          <Play size={12} />
        </TimelineIconButton>
      </div>
      {error && (
        <p className="motion-error" role="alert">
          {error}
        </p>
      )}
      {changed && (
        <p className="motion-error" role="alert">
          {t("changed")}
        </p>
      )}
    </PopoverContent>
  );
}
