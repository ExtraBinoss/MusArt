import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  motionTimeToSeconds,
  resolveMotionAudioProcessing,
  subtractMotionTime,
  validateMotionAudioProcessing,
  type EnginePort,
  type MotionAudioTrack,
  type MotionAudioProcessing,
  type Project,
} from "@musart/core";
import { Play } from "lucide-react";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { PopoverContent } from "../../ui/popover";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Slider } from "../../ui/slider";
import { Label } from "../../ui/label";
import "./messages";
export type AudioProcessingSection = "fadeIn" | "fadeOut" | "reverb" | "gain";
export interface AudioProcessingOrigin {
  project: Project;
  pageId: string;
  track: MotionAudioTrack;
  section: AudioProcessingSection;
}

/** Draft controls affect only their audition; Apply publishes one validated undo entry. */
export function AudioProcessingEditor({
  engine,
  origin,
  onClose,
}: {
  engine: EnginePort;
  origin: AudioProcessingOrigin;
  onClose: () => void;
}) {
  const { t } = useTranslation("motionAudio");
  const value = resolveMotionAudioProcessing(origin.track.processing),
    duration = subtractMotionTime(origin.track.end, origin.track.start);
  const [fadeIn, setFadeIn] = useState(String(motionTimeToSeconds(value.fadeIn) * 1000)),
    [fadeOut, setFadeOut] = useState(String(motionTimeToSeconds(value.fadeOut) * 1000));
  const [mix, setMix] = useState(value.reverb.mix),
    [decay, setDecay] = useState(value.reverb.decay);
  const [error, setError] = useState(""),
    [preparing, setPreparing] = useState(false);
  const service = getMotionAudioSession(engine),
    durationMs = motionTimeToSeconds(duration) * 1000;
  function processing(): MotionAudioProcessing {
    const time = (text: string) => {
      const ms = Number(text);
      if (!text.trim() || !Number.isFinite(ms) || ms < 0 || ms > durationMs)
        throw Error(t("fadeRange", { duration: Math.floor(durationMs) }));
      return { value: Math.min(Math.floor(durationMs * 48), Math.round(ms * 48)), rate: 48000 };
    };
    const result = { fadeIn: time(fadeIn), fadeOut: time(fadeOut), reverb: { mix, decay } };
    validateMotionAudioProcessing(result, duration);
    return result;
  }
  function apply() {
    try {
      const current = engine.getSnapshot();
      if (current.project !== origin.project || current.pageId !== origin.pageId)
        throw Error(t("changed"));
      engine.execute({
        type: "updateMotionAudioTrack",
        trackId: origin.track.id,
        patch: { processing: processing() },
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("processingFailed"));
    }
  }
  async function audition() {
    if (!service || preparing) return;
    try {
      const draft = processing();
      setError("");
      setPreparing(true);
      await service.previewTrack(origin.track.id, draft, origin.track.volume, origin.section);
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError"))
        setError(failure instanceof Error ? failure.message : t("processingFailed"));
    } finally {
      setPreparing(false);
    }
  }
  return (
    <PopoverContent
      className="motion-audio-processing"
      side="top"
      align="start"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <strong>{t(origin.section)}</strong>
        <span>{origin.track.name}</span>
      </header>
      <div className="motion-audio-fade-fields">
        <Label>
          <span>{t("fadeIn")}</span>
          <Input
            aria-label={t("fadeInDuration")}
            autoFocus={origin.section === "fadeIn"}
            type="number"
            min={0}
            max={durationMs}
            step={10}
            value={fadeIn}
            onChange={(event) => setFadeIn(event.currentTarget.value)}
          />
          <small>ms</small>
        </Label>
        <Label>
          <span>{t("fadeOut")}</span>
          <Input
            aria-label={t("fadeOutDuration")}
            autoFocus={origin.section === "fadeOut"}
            type="number"
            min={0}
            max={durationMs}
            step={10}
            value={fadeOut}
            onChange={(event) => setFadeOut(event.currentTarget.value)}
          />
          <small>ms</small>
        </Label>
      </div>
      <Label className="motion-audio-processing-slider">
        <span>{t("reverbMix")}</span>
        <Slider
          aria-label={t("reverbMix")}
          min={0}
          max={1}
          step={0.01}
          value={[mix]}
          onValueChange={(values) => setMix(values[0] ?? 0)}
        />
        <output>{Math.round(mix * 100)}%</output>
      </Label>
      <Label className="motion-audio-processing-slider">
        <span>{t("reverbDecay")}</span>
        <Slider
          aria-label={t("reverbDecay")}
          min={0.1}
          max={3}
          step={0.1}
          value={[decay]}
          onValueChange={(values) => setDecay(values[0] ?? 0.8)}
        />
        <output>{decay.toFixed(1)} s</output>
      </Label>
      <p>{t("auditionHint")}</p>
      {error && (
        <p className="motion-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <Button
          variant="ghost"
          size="sm"
          disabled={!service || preparing}
          onClick={() => {
            void audition();
          }}
        >
          <Play size={12} />
          {t(preparing ? "preparing" : "audition")}
        </Button>
        <Button size="sm" onClick={apply}>
          {t("apply")}
        </Button>
      </footer>
    </PopoverContent>
  );
}
