import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard, Download, Pause, Play, RotateCcw } from "lucide-react";
import { evaluateReplay, type EnginePort, type ReplaySpec } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { useEngine } from "../../state/session/editor";
import { createPlaybackSource } from "../../canvas/session/playback-source";
import { getAnimationSession } from "../../services/animation/session";
import { exportReplayVideo, VideoExportError } from "../../services/animation/export-video";
import { downloadBlob, safeName } from "../../services/files/download";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { NumberInput } from "../shared/NumberInput";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import "./messages";
import { HistoryPanel } from "./HistoryPanel";
import { ProjectActionDialog } from "../projects/actions/ProjectActionDialog";
import styles from "./AnimatePanel.module.css";

export function AnimatePanel({
  engine,
  services,
}: {
  engine: EnginePort;
  services: EditorServices;
}) {
  const { t } = useTranslation("animation");
  const snapshot = useEngine(engine);
  const session = useMemo(() => getAnimationSession(engine), [engine]);
  const recording = useSyncExternalStore(session.subscribe, session.read);
  const playback = useMemo(() => createPlaybackSource(engine), [engine]);
  const [prepared, setPrepared] = useState<{
    spec: ReplaySpec;
    projectId: string;
    version: number;
  } | null>(null);
  const spec =
    prepared?.projectId === snapshot.project.id && prepared.version === recording.version
      ? prepared.spec
      : null;
  const [preparing, setPreparing] = useState(false);
  const [clearTarget, setClearTarget] = useState<{ id: string; name: string } | null>(null);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(8);
  const [fps, setFps] = useState(30);
  const [scale, setScale] = useState(1);
  const [container, setContainer] = useState<"auto" | "mp4" | "webm">("auto");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const abortExport = useRef<AbortController | null>(null);
  const seek = useCallback(
    (value: number) => {
      if (!spec) return;
      timeRef.current = value;
      setTime(value);
      const project = evaluateReplay(spec, value * spec.duration);
      const page = project.pages.find((item) => item.id === snapshot.pageId);
      if (page) playback.set({ page, assets: { ...spec.assets, ...project.assets } });
    },
    [spec, snapshot.pageId, playback],
  );
  useEffect(() => {
    if (!playing || !spec) return;
    const started = performance.now() - timeRef.current * duration * 1000;
    let frame = 0;
    function tick(now: number) {
      const fraction = Math.min(1, (now - started) / (duration * 1000));
      seek(fraction);
      if (fraction < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, spec, duration, seek]);
  useEffect(
    () => () => {
      playback.set(null);
      abortExport.current?.abort();
    },
    [playback],
  );
  useEffect(() => () => playback.set(null), [snapshot.project.id, spec, playback]);
  async function prepare(download = false) {
    setError("");
    setPreparing(true);
    const projectId = snapshot.project.id;
    const revision = engine.getSnapshot().revision;
    const controller = new AbortController();
    abortExport.current = controller;
    try {
      const replay = await session.replay(controller.signal);
      if (engine.getSnapshot().project.id !== projectId || controller.signal.aborted) return;
      if (engine.getSnapshot().revision !== revision) {
        setError(t("historyChanged"));
        return;
      }
      if (download)
        downloadBlob(
          new Blob(
            [
              JSON.stringify({
                schema: "musart.history",
                version: 1,
                projectId,
                limit: recording.limit,
                replay,
              }),
            ],
            { type: "application/json" },
          ),
          `${safeName(snapshot.project.name)}-history.json`,
        );
      else {
        setPlaying(false);
        timeRef.current = 0;
        setTime(0);
        setPrepared({ spec: replay, projectId, version: session.read().version });
      }
    } catch {
      if (!controller.signal.aborted) setError(t("historyFailed"));
    } finally {
      abortExport.current = null;
      setPreparing(false);
    }
  }
  async function exportVideo() {
    if (!spec) return;
    setPlaying(false);
    playback.set(null);
    setError("");
    setProgress(0);
    const controller = new AbortController();
    abortExport.current = controller;
    try {
      const blob = await exportReplayVideo(spec, {
        duration,
        fps,
        scale,
        container,
        pageId: snapshot.pageId,
        signal: controller.signal,
        onProgress: setProgress,
        ...(services.mediaResolverFor
          ? { mediaResolver: services.mediaResolverFor(spec.initial.id) }
          : {}),
        ...(services.fonts ? { fontResolver: services.fonts.resolve } : {}),
      });
      downloadBlob(
        blob,
        `${safeName(snapshot.project.name)}-replay.${blob.type === "video/mp4" ? "mp4" : "webm"}`,
      );
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(t(failure instanceof VideoExportError ? failure.code : "exportFailed"));
    } finally {
      abortExport.current = null;
      setProgress(null);
    }
  }
  return (
    <ScrollShadow className={styles.scroll} surface="var(--background)">
      <section className={`${styles.panel} scrollable-panel`} aria-label={t("title")}>
        <header className={styles.heading}>
          <Clapperboard size={17} aria-hidden />
          <div>
            <h2>{t("title")}</h2>
            <p>{t("description")}</p>
          </div>
        </header>
        <HistoryPanel
          session={session}
          state={recording}
          projectId={snapshot.project.id}
          busy={progress !== null || preparing}
          onClear={() => setClearTarget({ id: snapshot.project.id, name: snapshot.project.name })}
          onPrepare={() => {
            void prepare();
          }}
          onDownload={() => {
            void prepare(true);
          }}
        />
        {spec && (
          <section className={styles.video} aria-label={t("videoSettings")}>
            <h3>{t("videoSettings")}</h3>
            <div className={styles.player}>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={t(playing ? "pause" : "play")}
                disabled={progress !== null || preparing}
                onClick={() => {
                  if (!playing && time >= 1) seek(0);
                  setPlaying((value) => !value);
                }}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </Button>
              <Slider
                aria-label={t("timeline")}
                min={0}
                max={1}
                step={0.001}
                value={[time]}
                disabled={progress !== null || preparing}
                onValueChange={([next]) => {
                  setPlaying(false);
                  seek(next ?? 0);
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("reset")}
                onClick={() => {
                  setPlaying(false);
                  timeRef.current = 0;
                  setTime(0);
                  playback.set(null);
                }}
              >
                <RotateCcw size={14} />
              </Button>
            </div>
            <div className={styles.fields}>
              <NumberInput
                label={t("duration")}
                value={duration}
                resetValue={8}
                min={1}
                max={30}
                step={0.1}
                unit="s"
                onCommit={setDuration}
              />
              <NumberInput
                label={t("fps")}
                value={fps}
                resetValue={30}
                min={1}
                max={60}
                unit="fps"
                onCommit={setFps}
              />
              <NumberInput
                label={t("scale")}
                value={scale}
                resetValue={1}
                min={0.1}
                max={4}
                step={0.1}
                unit="×"
                onCommit={setScale}
              />
              <Select
                value={container}
                onValueChange={(value) => setContainer(value as typeof container)}
              >
                <SelectTrigger aria-label={t("format")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("auto")}</SelectItem>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="webm">WebM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={progress !== null || preparing}
              onClick={() => {
                void exportVideo();
              }}
            >
              <Download size={14} />
              {progress === null
                ? t("export")
                : t("exporting", { percent: Math.round(progress * 100) })}
            </Button>
            {progress !== null && (
              <Button variant="ghost" onClick={() => abortExport.current?.abort()}>
                {t("cancel")}
              </Button>
            )}
          </section>
        )}
        {clearTarget && (
          <ProjectActionDialog
            name={clearTarget.name}
            action="clearHistory"
            onCancel={() => setClearTarget(null)}
            onConfirm={async () => {
              try {
                await services.clearHistory(clearTarget.id);
                if (engine.getSnapshot().project.id === clearTarget.id) {
                  setPrepared(null);
                  setPlaying(false);
                  setTime(0);
                  timeRef.current = 0;
                  playback.set(null);
                }
                return true;
              } catch {
                setError(t("historyFailed"));
                return false;
              }
            }}
          />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    </ScrollShadow>
  );
}
