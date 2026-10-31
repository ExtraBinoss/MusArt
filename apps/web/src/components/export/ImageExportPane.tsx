import { useMemo, useState, useSyncExternalStore } from "react";
import { selectionComposition } from "@musart/core";
import type { ManagedImageOptions } from "@musart/render";
import { useTranslation } from "react-i18next";
import { getExportJobs } from "../../services/export/jobs";
import { ExportLayout, ExportAdvanced } from "./ExportLayout";
import { ExportPreviewFrame } from "./ExportPreviewFrame";
import { useExportPreview } from "./use-export-preview";
import { usePrintPreview } from "./use-print-preview";
import { useManagedPreview } from "./use-managed-preview";
import { useStartExport } from "./use-start-export";
import type { ExportPaneProps } from "./workspace-model";
import { SelectField } from "../shared/SelectField";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { NumberInput } from "../shared/NumberInput";
import { PrintSettings } from "./PrintSettings";

export function ImageExportPane(
  props: ExportPaneProps & { allPages: boolean; onAllPagesChange: (value: boolean) => void },
) {
  const { engine, page, origin, selection, services, allPages, onAllPagesChange } = props;
  const { t } = useTranslation("exportPanel");
  const jobs = getExportJobs(engine);
  const busy = useSyncExternalStore(
    jobs.subscribe,
    () => jobs.pending,
    () => false,
  );
  const [options, setOptions] = useState<ManagedImageOptions>(() => ({
    format: page.colorSpace === "cmyk" ? "pdf" : "png",
    colorMode: page.colorSpace === "cmyk" ? "cmyk" : "srgb",
    quality: 1,
    print: {
      dpi: 300,
      bleedMm: 0,
      cropMarks: false,
      registrationMarks: false,
      colorBars: false,
      pageInfo: false,
    },
  }));
  const [scale, setScale] = useState(1);
  const [edge, setEdge] = useState<number | null>(null);
  const selectionOnly = selection.length > 0 && !allPages;
  const scope = useMemo(
    () => (selectionOnly ? selectionComposition(page, selection) : page),
    [page, selection, selectionOnly],
  );
  const previewServices = useMemo(
    () => ({
      previewExport: services.previewExport
        ? (
            request: Parameters<NonNullable<typeof services.previewExport>>[0],
            signal?: AbortSignal,
          ) =>
            services.previewExport!(
              {
                ...request,
                colorOutput: options.colorMode === "cmyk" ? "source" : "display",
              },
              signal,
            )
        : undefined,
    }),
    [services, options.colorMode],
  );
  const preview = useExportPreview(
    page,
    selection,
    selectionOnly,
    origin.revision,
    previewServices,
    options.format === "pdf" ? null : edge,
  );
  const managed = useManagedPreview(preview, options);
  const printPreview = usePrintPreview(
    origin.project,
    scope,
    options,
    services,
    busy ? null : edge,
  );
  const proof = options.format === "pdf" ? printPreview : managed;
  const bleed = Math.ceil((options.print.bleedMm * options.print.dpi) / 25.4);
  const margin = Object.entries(options.print).some(
    ([key, value]) => !["dpi", "bleedMm"].includes(key) && value === true,
  )
    ? (56 * options.print.dpi) / 72
    : 0;
  const previewWidth = options.format === "pdf" ? scope.width + 2 * bleed + margin : scope.width;
  const previewHeight = options.format === "pdf" ? scope.height + 2 * bleed + margin : scope.height;
  const start = useStartExport(props, "image");
  return (
    <ExportLayout
      {...props}
      submitLabel={t("imageExport")}
      disabled={busy}
      preview={
        <>
          <ExportPreviewFrame
            {...proof}
            width={previewWidth}
            height={previewHeight}
            format={options.format === "jpeg" ? "jpeg" : "png"}
            onResolution={setEdge}
          />
          <div className="export-preview-caption">
            <strong>{scope.name}</strong>
            <span>
              {Math.round(scope.width * scale)} × {Math.round(scope.height * scale)} px ·{" "}
              {options.colorMode === "cmyk" ? "CMYK · CGATS21 CRPC6" : "sRGB"}
            </span>
          </div>
        </>
      }
      onSubmit={() => {
        const retiring = printPreview.release();
        start(async ({ signal, progress, beforeFrame }) => {
          if (!services.exportComposition) throw new Error(t("unavailable"));
          await services.exportComposition(
            {
              mode: "static",
              compositionId: page.id,
              scale,
              image: { ...options, allPages, selectionOnly },
              selection,
              background: true,
              signal,
              onProgress: progress,
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
        <Label htmlFor="export-format">{t("format")}</Label>
        <SelectField
          id="export-format"
          label={t("format")}
          value={options.format}
          disabled={busy}
          options={(options.colorMode === "cmyk"
            ? ["pdf", "jpeg", "tiff"]
            : ["png", "jpeg", "webp", "pdf"]
          ).map((format) => ({
            value: format,
            label: format === "pdf" ? "PDF" : format.toUpperCase(),
          }))}
          onValueChange={(format) => {
            setOptions({ ...options, format: format as ManagedImageOptions["format"] });
            if (format === "pdf") setScale(1);
          }}
        />
      </div>
      <div className="export-field">
        <Label htmlFor="export-colors">{t("colors")}</Label>
        <SelectField
          id="export-colors"
          label={t("colors")}
          value={options.colorMode}
          disabled={busy}
          options={[
            { value: "srgb", label: "sRGB" },
            { value: "cmyk", label: t("cmyk") },
          ]}
          onValueChange={(colorMode) => {
            setOptions({
              ...options,
              colorMode: colorMode as "srgb" | "cmyk",
              format: colorMode === "cmyk" ? "pdf" : "png",
            });
            setScale(1);
          }}
        />
        <p className="export-scope">{t(options.colorMode === "cmyk" ? "cmykHint" : "srgbHint")}</p>
      </div>
      {options.format !== "pdf" && (
        <div className="export-field">
          <Label htmlFor="export-scale">{t("scale")}</Label>
          <SelectField
            id="export-scale"
            label={t("scale")}
            value={String(scale)}
            disabled={busy}
            options={[0.5, 1, 2, 3, 4].map((value) => ({
              value: String(value),
              label: `${value}×`,
            }))}
            onValueChange={(value) => setScale(Number(value))}
          />
        </div>
      )}
      {options.format === "pdf" && (
        <PrintSettings
          value={options.print}
          onChange={(print) => setOptions({ ...options, print })}
          disabled={busy}
        />
      )}
      <ExportAdvanced>
        {["jpeg", "webp", "pdf"].includes(options.format) && (
          <NumberInput
            label={t("quality")}
            value={Math.round(options.quality * 100)}
            min={10}
            max={100}
            disabled={busy}
            unit="%"
            onCommit={(quality) => setOptions({ ...options, quality: quality / 100 })}
          />
        )}
        {origin.project.pages.length > 1 && (
          <label className="switch-row">
            <span>{t("allArtboards")}</span>
            <Switch
              aria-label={t("allArtboards")}
              checked={allPages}
              disabled={busy}
              onCheckedChange={onAllPagesChange}
            />
          </label>
        )}
        <p className="export-scope">{t("previewHint")}</p>
      </ExportAdvanced>
    </ExportLayout>
  );
}
