import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard, Download, LoaderCircle, Pause, Play } from "lucide-react";
import type { EnginePort, ReplaySpec } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { getAnimationSession } from "../../../services/animation/session";
import { exportReplayVideo, VideoExportError } from "../../../services/animation/export-video";
import { isTimelapseDuration } from "../../../services/animation/replay-timing";
import { freezeEffectPreviews } from "../../../state/session/effect-preview";
import { downloadBlob, safeName } from "../../../services/files/download";
import { useTimelapsePreview } from "./use-timelapse-preview.tsx";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Slider } from "../../ui/slider";
import { Label } from "../../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import "./messages";
import styles from "./TimelapseDialog.module.css";

export function TimelapseDialog({
  engine,
  services,
  onClose,
  returnFocus,
}: {
  engine: EnginePort;
  services: EditorServices;
  onClose: () => void;
  returnFocus?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("timelapse");
  const origin = useMemo(() => engine.getSnapshot(), [engine]);
  const [spec, setSpec] = useState<ReplaySpec | null>(null);
  const [error, setError] = useState("");
  const [durationText, setDurationText] = useState("10");
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const duration = Number(durationText);
  const valid = durationText.trim() !== "" && isTimelapseDuration(duration);
  const { viewport, slider, clock, controls, status, playing } = useTimelapsePreview(
    spec,
    origin.pageId,
    valid ? duration : 10,
    progress === null && valid,
    services.fonts?.resolve,
    services.mediaResolverFor?.(origin.project.id),
  );

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    operation.current = controller;
    freezeEffectPreviews(engine);
    const unsubscribe = engine.subscribe(() => {
      const next = engine.getSnapshot();
      if (next.project.id !== origin.project.id || next.pageId !== origin.pageId) onClose();
      else if (next.revision !== origin.revision) {
        operation.current?.abort();
        setSpec(null);
        setProgress(null);
        setError("historyChanged");
      }
    });
    void getAnimationSession(engine)
      .replay(controller.signal)
      .then(
        (replay) => {
          if (controller.signal.aborted || !alive.current) return;
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
          if (!controller.signal.aborted && alive.current) setError("historyFailed");
        },
      );
    return () => {
      alive.current = false;
      controller.abort();
      operation.current?.abort();
      unsubscribe();
    };
  }, [engine, origin, onClose]);

  function close() {
    operation.current?.abort();
    onClose();
  }
  async function submit() {
    if (!spec || !valid || progress !== null) return;
    controls.current?.pause();
    const releasePreview = controls.current?.release();
    const controller = new AbortController();
    operation.current = controller;
    setProgress(0);
    setError("");
    setSaved(false);
    try {
      // Retire the preview before allocating a full-resolution export context.
      await releasePreview;
      controller.signal.throwIfAborted();
      const blob = await exportReplayVideo(spec, {
        duration,
        fps: 30,
        scale: 1,
        container: "auto",
        pageId: origin.pageId,
        signal: controller.signal,
        onProgress: (fraction) => {
          if (alive.current && !controller.signal.aborted) setProgress(fraction);
        },
        ...(services.mediaResolverFor
          ? { mediaResolver: services.mediaResolverFor(origin.project.id) }
          : {}),
        ...(services.fonts ? { fontResolver: services.fonts.resolve } : {}),
      });
      if (controller.signal.aborted || !alive.current) return;
      downloadBlob(
        blob,
        `${safeName(origin.project.name)}-timelapse.${blob.type === "video/mp4" ? "mp4" : "webm"}`,
      );
      setSaved(true);
    } catch (failure) {
      if (alive.current && !controller.signal.aborted)
        setError(failure instanceof VideoExportError ? failure.code : "exportFailed");
    } finally {
      if (alive.current && !controller.signal.aborted) setProgress(null);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={styles.dialog}
        data-canvas-control
        data-keybinding-capture
        onCloseAutoFocus={(event) => {
          if (returnFocus?.current) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <DialogHeader>
          <div className={styles.heading}>
            <Clapperboard size={20} aria-hidden />
            <DialogTitle>{t("title")}</DialogTitle>
          </div>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className={styles.preview} aria-label={t("preview")}>
          <div className={styles.surface} ref={viewport} />
          {!spec && !error && (
            <p role="status">
              <LoaderCircle size={18} className="animate-spin" />
              {t("preparing")}
            </p>
          )}
          {spec && status === "preparing" && progress === null && (
            <p role="status">{t("preparing")}</p>
          )}
          {spec && status === "failed" && <p role="status">{t("previewFailed")}</p>}
        </div>
        <div className={styles.player}>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={t(playing ? "pause" : "play")}
            disabled={!spec || !valid || progress !== null || status !== "ready"}
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
            disabled={!spec || !valid || progress !== null}
            onValueChange={([position]) => controls.current?.seek(position ?? 0)}
          />
          <output ref={clock}>0.0 / {valid ? duration : "–"} s</output>
        </div>
        <div className={styles.duration}>
          <Label htmlFor="timelapse-duration">{t("duration")}</Label>
          <div>
            <Input
              id="timelapse-duration"
              type="number"
              min={1}
              max={30}
              step="any"
              value={durationText}
              disabled={progress !== null}
              aria-invalid={!valid}
              aria-describedby="timelapse-duration-hint"
              onChange={(event) => {
                setDurationText(event.target.value);
                setSaved(false);
              }}
            />
            <span>s</span>
          </div>
          <p id="timelapse-duration-hint" className={!valid ? styles.error : ""}>
            {t(valid ? "durationHint" : "invalidDuration")}
          </p>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {t(error)}
          </p>
        )}
        {saved && (
          <p role="status" className={styles.saved}>
            {t("saved")}
          </p>
        )}
        {progress !== null && (
          <progress
            aria-label={t("exporting", { percent: Math.round(progress * 100) })}
            max={1}
            value={progress}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("cancel")}
          </Button>
          <Button
            className={styles.exportButton}
            disabled={!spec || !valid || progress !== null}
            onClick={() => {
              void submit();
            }}
          >
            {progress === null ? (
              <Download size={15} />
            ) : (
              <LoaderCircle size={15} className="animate-spin" />
            )}
            {t(progress === null ? "export" : "exporting", {
              percent: Math.round((progress ?? 0) * 100),
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
