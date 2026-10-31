import { selectionComposition } from "@musart/core";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { createMotionPreview } from "@musart/render";
import { getExportJobs } from "../../services/export/jobs";
import { MotionExportPreview } from "./MotionExportPreview";
import { ExportLayout, ExportAdvanced } from "./ExportLayout";
import { useStartExport } from "./use-start-export";
import type { ExportPaneProps } from "./workspace-model";
import { SelectField } from "../shared/SelectField";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

export function MotionExportPane(props: ExportPaneProps) {
  const { engine, origin, page, selection, services } = props;
  const { t } = useTranslation("exportPanel");
  const jobs = getExportJobs(engine),
    busy = useSyncExternalStore(
      jobs.subscribe,
      () => jobs.pending,
      () => false,
    );
  const [scale, setScale] = useState(1),
    [container, setContainer] = useState<"auto" | "mp4" | "webm">("auto");
  const [fps, setFps] = useState("composition"),
    [bitrate, setBitrate] = useState(8_000_000),
    [audio, setAudio] = useState(true);
  const preview = useRef<ReturnType<typeof createMotionPreview> | null>(null);
  const receive = useCallback((source: ReturnType<typeof createMotionPreview> | null) => {
    preview.current = source;
  }, []);
  const start = useStartExport(props, "motion");
  const scope = useMemo(
    () => (selection.length ? selectionComposition(page, selection) : page),
    [page, selection],
  );
  const motion = page.motion!;
  const rate =
    fps === "composition"
      ? motion.frameRate
      : { numerator: Number(fps.split("/")[0]), denominator: Number(fps.split("/")[1] ?? 1) };
  const duration = motion.duration.value / motion.duration.rate;
  const hasAudio = Boolean(
    (!selection.length && motion.audioTracks?.length) ||
    scope.layers.some((layer) => layer.kind === "video"),
  );
  return (
    <ExportLayout
      {...props}
      submitLabel={t("exportVideo")}
      disabled={busy}
      preview={
        <>
          <MotionExportPreview
            project={origin.project}
            page={page}
            services={services}
            selection={selection}
            paused={busy}
            onReady={receive}
          />
          <div className="export-preview-caption">
            <strong>{page.name}</strong>
            <span>
              {Math.round(scope.width * scale)} × {Math.round(scope.height * scale)} px ·{" "}
              {t("duration", {
                seconds: duration.toFixed(2),
                rate: `${rate.numerator}/${rate.denominator}`,
              })}{" "}
              · sRGB
            </span>
          </div>
        </>
      }
      onSubmit={() => {
        const retiring = preview.current?.dispose();
        start(async ({ signal, progress, beforeFrame }) => {
          signal.throwIfAborted();
          if (!services.exportComposition) throw new Error(t("unavailable"));
          await services.exportComposition(
            {
              mode: "motion",
              compositionId: page.id,
              scale,
              container,
              frameRate: rate,
              videoBitrate: bitrate,
              audioBitrate: 192_000,
              audio,
              selection,
              signal,
              onProgress: progress,
              background: true,
              beforeFrame: async () => {
                await retiring;
                await beforeFrame();
              },
            },
            {
              projectId: origin.project.id,
              compositionId: page.id,
              revision: origin.revision,
              page,
            },
          );
        });
      }}
    >
      <div className="export-field">
        <Label htmlFor="motion-export-container">{t("format")}</Label>
        <SelectField
          id="motion-export-container"
          label={t("format")}
          value={container}
          disabled={busy}
          options={[
            { value: "auto", label: t("automatic") },
            { value: "mp4", label: "MP4" },
            { value: "webm", label: "WebM" },
          ]}
          onValueChange={(value) => setContainer(value as typeof container)}
        />
      </div>
      <div className="export-field">
        <Label htmlFor="motion-export-scale">{t("resolution")}</Label>
        <SelectField
          id="motion-export-scale"
          label={t("resolution")}
          value={String(scale)}
          disabled={busy}
          options={[0.5, 1, 2, 3, 4].map((value) => ({ value: String(value), label: `${value}×` }))}
          onValueChange={(value) => setScale(Number(value))}
        />
      </div>
      {hasAudio && (
        <label className="switch-row">
          <span>{t("includeAudio")}</span>
          <Switch
            aria-label={t("includeAudio")}
            checked={audio}
            disabled={busy}
            onCheckedChange={setAudio}
          />
        </label>
      )}
      <ExportAdvanced>
        <div className="export-field">
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
              ...["24", "25", "30", "60", "24000/1001", "30000/1001", "60000/1001"].map(
                (value) => ({ value, label: `${value} fps` }),
              ),
            ]}
            onValueChange={setFps}
          />
        </div>
        <div className="export-field">
          <Label htmlFor="motion-export-quality">{t("bitrate")}</Label>
          <SelectField
            id="motion-export-quality"
            label={t("bitrate")}
            value={String(bitrate)}
            disabled={busy}
            options={[4, 8, 16].map((value) => ({
              value: String(value * 1_000_000),
              label: `${value} Mb/s`,
            }))}
            onValueChange={(value) => setBitrate(Number(value))}
          />
        </div>
        {hasAudio && audio && <p className="export-scope">{t("audioDefaults")}</p>}
      </ExportAdvanced>
    </ExportLayout>
  );
}
