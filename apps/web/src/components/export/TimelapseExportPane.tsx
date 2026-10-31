import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReplaySpec } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { getExportJobs } from "../../services/export/jobs";
import { getAnimationSession } from "../../services/animation/session";
import { isTimelapseDuration } from "../../services/animation/replay-timing";
import { exportReplayVideo, VideoExportError } from "../../services/animation/export-video";
import { downloadBlob, safeName } from "../../services/files/download";
import { useTimelapsePreview } from "../animation/timelapse/use-timelapse-preview";
import { ExportLayout, ExportAdvanced } from "./ExportLayout";
import { useStartExport } from "./use-start-export";
import type { ExportPaneProps } from "./workspace-model";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { SelectField } from "../shared/SelectField";
import "../animation/timelapse/messages";

export function TimelapseExportPane(props: ExportPaneProps) {
  const { engine, origin, page, selection, services, onClose } = props;
  const { t } = useTranslation("timelapse"),
    { t: common } = useTranslation("exportPanel");
  const [spec, setSpec] = useState<ReplaySpec | null>(null),
    [error, setError] = useState("");
  const [durationText, setDuration] = useState("10"),
    [scale, setScale] = useState(1),
    [fps, setFps] = useState(30);
  const [container, setContainer] = useState<"auto" | "mp4" | "webm">("auto");
  const duration = Number(durationText),
    valid = durationText.trim() !== "" && isTimelapseDuration(duration);
  const jobs = getExportJobs(engine),
    busy = useSyncExternalStore(
      jobs.subscribe,
      () => jobs.pending,
      () => false,
    );
  const media = useMemo(
    () => services.mediaResolverFor?.(origin.project.id),
    [services, origin.project.id],
  );
  const { viewport, slider, clock, controls, status, playing } = useTimelapsePreview(
    spec,
    page.id,
    valid ? duration : 10,
    !busy && valid,
    services.fonts?.resolve,
    media,
    selection,
    true,
  );
  useEffect(() => {
    const controller = new AbortController();
    void getAnimationSession(engine)
      .replay(controller.signal)
      .then(
        (replay) => {
          if (controller.signal.aborted) return;
          if (engine.getSnapshot().revision !== origin.revision) {
            setError("historyChanged");
            return;
          }
          if (!replay.events.length) {
            setError("emptyHistory");
            return;
          }
          setSpec(replay);
        },
        () => {
          if (!controller.signal.aborted) setError("historyFailed");
        },
      );
    return () => controller.abort();
  }, [engine, origin]);
  useEffect(
    () =>
      engine.subscribe(() => {
        const next = engine.getSnapshot();
        if (next.project.id !== origin.project.id) {
          onClose();
          return;
        }
        if (!jobs.pending && next.revision !== origin.revision) {
          setSpec(null);
          setError("historyChanged");
        }
      }),
    [engine, origin, jobs, onClose],
  );
  const start = useStartExport(props, "timelapse");
  return (
    <ExportLayout
      {...props}
      submitLabel={t("export")}
      disabled={!spec || !valid || busy}
      preview={
        <>
          <div ref={viewport} className="motion-export-preview-surface" aria-label={t("preview")} />
          {(!spec || status !== "ready") && (
            <p role="status" className="export-scope">
              {error ? t(error) : t(status === "failed" ? "previewFailed" : "preparing")}
            </p>
          )}
          <div className="motion-export-preview-controls">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(playing ? "pause" : "play")}
              disabled={!spec || !valid || busy || status !== "ready"}
              onClick={() => (playing ? controls.current?.pause() : controls.current?.play())}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </Button>
            <Slider
              valueSource={slider}
              min={0}
              max={valid ? duration : 10}
              step={1 / 30}
              aria-label={t("position")}
              disabled={!spec || !valid || busy}
              onValueChange={([value]) => controls.current?.seek(value ?? 0)}
            />
            <output ref={clock}>0.0 / {valid ? duration : "–"} s</output>
          </div>
          <div className="export-preview-caption">
            <strong>{page.name}</strong>
            <span>{common("timelapse")} · sRGB</span>
          </div>
        </>
      }
      onSubmit={() => {
        if (!spec || !valid) return;
        const retiring = controls.current?.release();
        start(async ({ signal, progress, beforeFrame }) => {
          await retiring;
          signal.throwIfAborted();
          try {
            const blob = await exportReplayVideo(spec, {
              duration,
              fps,
              scale,
              container,
              pageId: page.id,
              signal,
              onProgress: progress,
              fontResolver: services.fonts?.resolve,
              mediaResolver: media,
              selection,
              beforeFrame,
            });
            signal.throwIfAborted();
            if (engine.getSnapshot().project.id !== origin.project.id)
              throw new Error(common("stale"));
            downloadBlob(
              blob,
              `${safeName(page.name)}-timelapse.${blob.type === "video/mp4" ? "mp4" : "webm"}`,
            );
          } catch (failure) {
            throw failure instanceof VideoExportError
              ? new Error(t(failure.code), { cause: failure })
              : failure;
          }
        });
      }}
    >
      <div className="export-field">
        <Label htmlFor="timelapse-duration">{t("duration")}</Label>
        <Input
          id="timelapse-duration"
          type="number"
          min={1}
          max={30}
          step="any"
          value={durationText}
          disabled={busy}
          aria-invalid={!valid}
          aria-describedby="timelapse-duration-hint"
          onChange={(event) => setDuration(event.target.value)}
        />
        <p id="timelapse-duration-hint" className="export-scope">
          {t(valid ? "durationHint" : "invalidDuration")}
        </p>
      </div>
      <div className="export-field">
        <Label htmlFor="timelapse-container">{common("format")}</Label>
        <SelectField
          id="timelapse-container"
          label={common("format")}
          value={container}
          disabled={busy}
          options={[
            { value: "auto", label: common("automatic") },
            { value: "mp4", label: "MP4" },
            { value: "webm", label: "WebM" },
          ]}
          onValueChange={(value) => setContainer(value as typeof container)}
        />
      </div>
      {error && <p role="alert">{t(error)}</p>}
      <ExportAdvanced>
        <div className="export-field">
          <Label htmlFor="timelapse-scale">{common("resolution")}</Label>
          <SelectField
            id="timelapse-scale"
            label={common("resolution")}
            value={String(scale)}
            disabled={busy}
            options={[0.5, 1, 2, 3, 4].map((value) => ({
              value: String(value),
              label: `${value}×`,
            }))}
            onValueChange={(value) => setScale(Number(value))}
          />
        </div>
        <div className="export-field">
          <Label htmlFor="timelapse-fps">{common("frameRate")}</Label>
          <SelectField
            id="timelapse-fps"
            label={common("frameRate")}
            value={String(fps)}
            disabled={busy}
            options={[24, 25, 30, 60].map((value) => ({
              value: String(value),
              label: `${value} fps`,
            }))}
            onValueChange={(value) => setFps(Number(value))}
          />
        </div>
      </ExportAdvanced>
    </ExportLayout>
  );
}
