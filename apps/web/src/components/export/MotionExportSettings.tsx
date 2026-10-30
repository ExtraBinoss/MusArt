import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, Project } from "@musart/core";
import type { createMotionPreview } from "@musart/render";
import type { CompositionExportScope } from "../../services/export/model";
import type { ExportPopoverProps } from "./model";
import { MotionExportPreview } from "./MotionExportPreview";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { SelectField } from "../shared/SelectField";
import { Switch } from "../ui/switch";
import { ExportScopeError } from "../../services/session/export-scope";

export function MotionExportSettings({
  page,
  project,
  scope,
  services,
  onTask,
  onOpenChange,
  pendingRef,
  onPendingChange,
}: {
  page: Composition;
  project: Project;
  scope: CompositionExportScope;
  services: ExportPopoverProps["services"];
  onTask: ExportPopoverProps["onTask"];
  onOpenChange: ExportPopoverProps["onOpenChange"];
  pendingRef: MutableRefObject<boolean>;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useTranslation("exportPanel");
  const [scale, setScale] = useState(1),
    [fps, setFps] = useState("composition");
  const [container, setContainer] = useState<"auto" | "mp4" | "webm">("auto");
  const [videoBitrate, setBitrate] = useState(8_000_000),
    [audio, setAudio] = useState(true);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null),
    [cancelling, setCancelling] = useState(false);
  const abort = useRef<AbortController | null>(null),
    alive = useRef(true);
  const preview = useRef<ReturnType<typeof createMotionPreview> | null>(null),
    stopping = useRef(false);
  const previewReady = useCallback((source: ReturnType<typeof createMotionPreview> | null) => {
    if (source && stopping.current) void source.dispose().catch(() => {});
    else preview.current = source;
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);
  const motion = page.motion!,
    duration = motion.duration.value / motion.duration.rate;
  const rate =
    fps === "composition"
      ? motion.frameRate
      : {
          numerator: Number(fps.split("/")[0]),
          denominator: Number(fps.split("/")[1] ?? 1),
        };
  async function submit() {
    if (pendingRef.current) return;
    const controller = new AbortController();
    abort.current = controller;
    pendingRef.current = true;
    setBusy(true);
    setFailure(null);
    setProgress(0);
    setCancelling(false);
    onPendingChange?.(true);
    stopping.current = true;
    let failed: unknown = null,
      published = -1;
    try {
      await preview.current?.dispose();
      const ok = await onTask(async () => {
        try {
          if (!services.exportComposition) throw new Error(t("unavailable"));
          await services.exportComposition(
            {
              mode: "motion",
              compositionId: page.id,
              scale,
              frameRate: rate,
              container,
              videoBitrate,
              audioBitrate: 192_000,
              audio,
              signal: controller.signal,
              onProgress: (fraction) => {
                const next = Math.floor(fraction * 100);
                if (alive.current && published !== next) {
                  published = next;
                  setProgress(next);
                }
              },
            },
            scope,
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          failed = error;
          throw error instanceof ExportScopeError ? new Error(t("stale"), { cause: error }) : error;
        }
      });
      if (!controller.signal.aborted && alive.current) {
        if (ok) onOpenChange(false);
        else setFailure(failed instanceof ExportScopeError ? t("stale") : t("exportFailed"));
      }
    } catch (error) {
      if (alive.current && !controller.signal.aborted)
        setFailure(error instanceof Error ? error.message : t("exportFailed"));
    } finally {
      if (abort.current === controller) abort.current = null;
      pendingRef.current = false;
      if (alive.current) onPendingChange?.(false);
      stopping.current = false;
      if (alive.current) {
        setBusy(false);
        setCancelling(false);
      }
    }
  }
  return (
    <div className="export-settings-panel motion-export-settings">
      <MotionExportPreview
        project={project}
        page={page}
        services={services}
        paused={busy}
        onReady={previewReady}
      />
      <p className="export-scope">{t("motionArtboard", { name: page.name })}</p>
      <div className="export-scaling-row">
        <Label htmlFor="motion-export-scale">{t("resolution")}</Label>
        <SelectField
          id="motion-export-scale"
          label={t("resolution")}
          value={String(scale)}
          disabled={busy}
          options={[0.5, 1, 2, 3, 4].map((value) => ({ value: String(value), label: value + "×" }))}
          onValueChange={(value) => setScale(Number(value))}
        />
        <strong className="export-pixels">
          {Math.max(1, Math.round(page.width * scale))} ×{" "}
          {Math.max(1, Math.round(page.height * scale))} px
        </strong>
      </div>
      <div className="export-format-row">
        <Label htmlFor="motion-export-fps">{t("frameRate")}</Label>
        <SelectField
          id="motion-export-fps"
          label={t("frameRate")}
          value={fps}
          disabled={busy}
          options={[
            {
              value: "composition",
              label: t("authoredRate", {
                rate: motion.frameRate.numerator / motion.frameRate.denominator,
              }),
            },
            ...["24", "25", "30", "60", "24000/1001", "30000/1001", "60000/1001"].map((value) => ({
              value,
              label: value + " fps",
            })),
          ]}
          onValueChange={setFps}
        />
      </div>
      <p className="export-scope">
        {t("duration", {
          seconds: duration.toFixed(3),
          rate: rate.numerator + "/" + rate.denominator,
        })}
      </p>
      <div className="export-format-row">
        <Label htmlFor="motion-export-container">{t("container")}</Label>
        <SelectField
          id="motion-export-container"
          label={t("container")}
          value={container}
          disabled={busy}
          options={[
            { value: "auto", label: t("automatic") },
            { value: "mp4", label: "MP4 · AVC / AAC" },
            { value: "webm", label: "WebM · VP9, VP8 / Opus" },
          ]}
          onValueChange={(value) => setContainer(value as typeof container)}
        />
      </div>
      <div className="export-format-row">
        <Label htmlFor="motion-export-quality">{t("bitrate")}</Label>
        <SelectField
          id="motion-export-quality"
          label={t("bitrate")}
          value={String(videoBitrate)}
          disabled={busy}
          options={[4, 8, 16].map((value) => ({
            value: String(value * 1_000_000),
            label: value + " Mb/s",
          }))}
          onValueChange={(value) => setBitrate(Number(value))}
        />
      </div>
      <label className="switch-row">
        <span>{t("includeAudio")}</span>
        <Switch
          checked={audio}
          disabled={busy}
          onCheckedChange={setAudio}
          aria-label={t("includeAudio")}
        />
      </label>
      {audio && <p className="export-scope">{t("audioDefaults")}</p>}
      {busy && (
        <progress max="100" value={progress} aria-label={t("progress")}>
          {progress}%
        </progress>
      )}
      {failure && <p role="alert">{failure}</p>}
      <div className="export-footer">
        <Button
          variant="outline"
          disabled={cancelling}
          onClick={() => {
            if (busy) {
              setCancelling(true);
              abort.current?.abort();
            } else onOpenChange(false);
          }}
        >
          {t(cancelling ? "cancelling" : "cancel")}
        </Button>
        <Button
          className="export-submit"
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
          {t(busy ? "exportingVideo" : "exportVideo")}
        </Button>
      </div>
    </div>
  );
}
