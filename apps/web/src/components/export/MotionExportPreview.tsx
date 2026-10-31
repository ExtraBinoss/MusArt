import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, Project } from "@musart/core";
import type { createMotionPreview } from "@musart/render";
import type { EditorServices } from "../../state/contracts";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { createSliderValue } from "../ui/slider-value";

/** Canvas ownership and clock updates stay local; React sees only play/error transitions. */
export function MotionExportPreview({
  project,
  page,
  services,
  paused = false,
  onReady,
  selection,
}: {
  project: Project;
  page: Composition;
  services: EditorServices;
  paused?: boolean;
  selection?: readonly string[];
  onReady?: (preview: ReturnType<typeof createMotionPreview> | null) => void;
}) {
  const { t } = useTranslation("exportPanel");
  const host = useRef<HTMLDivElement>(null);
  const [slider] = useState(() => createSliderValue([0]));
  const counter = useRef<HTMLOutputElement>(null);
  const source = useRef<ReturnType<typeof createMotionPreview> | null>(null);
  const pauseRequested = useRef(paused);
  const [playing, setPlaying] = useState(true),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (paused) return;
    let active = true,
      preview: ReturnType<typeof createMotionPreview> | undefined;
    let stop: (() => void) | undefined,
      shownPlaying = true;
    const hidden = () => {
      if (document.hidden) preview?.pause();
    };
    void import("@musart/render")
      .then(({ createMotionPreview }) => {
        if (!active) return;
        preview = createMotionPreview(project, {
          compositionId: page.id,
          selection,
          edge: 768,
          mediaResolver: services.mediaResolverFor?.(project.id),
          fontResolver: services.fonts?.resolve,
          onFrame(canvas, backend) {
            if (backend) canvas.dataset.backend = backend;
            if (active && host.current && canvas.parentElement !== host.current)
              host.current.replaceChildren(canvas);
          },
        });
        source.current = preview;
        onReady?.(preview);
        const paint = () => {
          if (!active || !preview) return;
          const state = preview.read(),
            seconds = state.time.value / state.time.rate;
          slider.set([seconds * 1000]);
          if (counter.current) counter.current.textContent = seconds.toFixed(3) + " s";
          if (state.playing !== shownPlaying) {
            shownPlaying = state.playing;
            setPlaying(state.playing);
          }
          if (state.error) setFailed(true);
        };
        stop = preview.subscribe(paint);
        if (pauseRequested.current) preview.pause();
        document.addEventListener("visibilitychange", hidden);
        paint();
        hidden();
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      stop?.();
      document.removeEventListener("visibilitychange", hidden);
      if (source.current === preview) source.current = null;
      onReady?.(null);
      if (preview) void preview.dispose().catch(() => {});
    };
  }, [project, page.id, services, paused, onReady, slider, selection]);
  useEffect(() => {
    pauseRequested.current = paused;
    if (paused) source.current?.pause();
  }, [paused]);
  const duration = page.motion!.duration.value / page.motion!.duration.rate;
  return (
    <div className="motion-export-preview">
      <div ref={host} className="motion-export-preview-surface" aria-label={t("preview")} />
      {failed && <p role="alert">{t("failed")}</p>}
      <div className="motion-export-preview-controls">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={failed || paused}
          aria-label={t(playing ? "pausePreview" : "playPreview")}
          onClick={() => {
            const preview = source.current;
            if (preview?.read().playing) preview.pause();
            else preview?.play();
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <Slider
          className="motion-export-preview-slider"
          tone="primary"
          min={0}
          max={duration * 1000}
          step={1}
          valueSource={slider}
          aria-label={t("previewTime")}
          disabled={failed || paused}
          onValueChange={(values) => {
            const value = values[0] ?? 0;
            slider.set([value]);
            source.current?.seek({ value, rate: 1000 });
          }}
        />
        <output ref={counter}>0.000 s</output>
      </div>
      <small className="export-preview-audio-note">{t("mutedPreview")}</small>
    </div>
  );
}
