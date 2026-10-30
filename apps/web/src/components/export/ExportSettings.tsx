import { BrandStatus } from "../../ui/brand/BrandStatus";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { selectionComposition } from "@musart/core";
import type { ExportOptions } from "../../state/contracts";
import type { ExportPopoverProps } from "./model";
import { useExportPreview } from "./use-export-preview";
import { ExportPreviewFrame } from "./ExportPreviewFrame";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { SelectField } from "../shared/SelectField";
import { Switch } from "../ui/switch";
import { NumberInput } from "../shared/NumberInput";
import { ExportScopeError } from "../../services/session/export-scope";

const emptySelection: readonly string[] = Object.freeze([]);
export function ExportSettings({
  page,
  pageCount,
  selection = emptySelection,
  revision = 0,
  services,
  onTask,
  onOpenChange,
  pendingRef,
  onPendingChange,
}: Omit<ExportPopoverProps, "open"> & { pendingRef: MutableRefObject<boolean> }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ExportOptions>({
    scale: 1,
    format: "png",
    quality: 1,
    allPages: false,
  });
  const [whole, setWhole] = useState(false),
    [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [previewEdge, setPreviewEdge] = useState<number | null>(null);
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);
  const selectionOnly = selection.length > 0 && !whole && !options.allPages;
  const scope = useMemo(
    () => (selectionOnly ? selectionComposition(page, selection) : page),
    [page, selection, selectionOnly],
  );
  const preview = useExportPreview(page, selection, selectionOnly, revision, services, previewEdge);
  async function submit() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    onPendingChange?.(true);
    setBusy(true);
    setFailed(false);
    const controller = new AbortController();
    abort.current = controller;
    const request = {
      ...options,
      signal: controller.signal,
      ...(selectionOnly ? { selectionOnly: true } : {}),
    };
    const scope = { page, revision, selection: [...selection] };
    let ok = false;
    try {
      ok = await onTask(async () => {
        try {
          await services.exportImage(request, scope);
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ExportScopeError)
            throw new Error(t("exportPanel:stale"), { cause: error });
          throw error;
        }
      });
    } catch {
      if (alive.current && !controller.signal.aborted) setFailed(true);
    } finally {
      pendingRef.current = false;
      if (alive.current) onPendingChange?.(false);
      if (abort.current === controller) abort.current = null;
      if (alive.current) setBusy(false);
    }
    if (alive.current && ok && !controller.signal.aborted) onOpenChange(false);
    else if (alive.current && !controller.signal.aborted) setFailed(true);
  }
  return (
    <div className="export-settings-panel">
      <ExportPreviewFrame
        {...preview}
        width={scope.width}
        height={scope.height}
        format={options.format}
        onResolution={setPreviewEdge}
      />
      <p className="export-scope">
        {selectionOnly
          ? t("exportPanel:selection", { count: selection.length })
          : t("exportPanel:artboard", { name: page.name })}
      </p>
      <div className="export-format-row">
        <Label htmlFor="export-format">{t("format")}</Label>
        <SelectField
          id="export-format"
          label={t("format")}
          value={options.format}
          disabled={busy}
          options={["png", "jpeg", "webp"].map((format) => ({
            value: format,
            label: format.toUpperCase(),
          }))}
          onValueChange={(format) =>
            setOptions({ ...options, format: format as ExportOptions["format"] })
          }
        />
      </div>
      <div className="export-scaling-row">
        <div className="export-scale-picker">
          <Label htmlFor="export-scale">{t("scale")}</Label>
          <SelectField
            id="export-scale"
            label={t("scale")}
            value={String(options.scale)}
            disabled={busy}
            options={[0.5, 1, 2, 3, 4].map((scale) => ({
              value: String(scale),
              label: `${scale}×`,
            }))}
            onValueChange={(scale) => setOptions({ ...options, scale: Number(scale) })}
          />
        </div>
        <strong className="export-pixels" aria-label={t("exportSize")}>
          {Math.round(scope.width * options.scale)} × {Math.round(scope.height * options.scale)}{" "}
          <small>px</small>
        </strong>
      </div>
      {options.format !== "png" && (
        <NumberInput
          label={t("quality")}
          value={Math.round(options.quality * 100)}
          min={10}
          max={100}
          unit="%"
          disabled={busy}
          onCommit={(quality) => setOptions({ ...options, quality: quality / 100 })}
        />
      )}
      {selection.length > 0 && (
        <label className="switch-row">
          <span>{t("exportPanel:whole")}</span>
          <Switch
            aria-label={t("exportPanel:whole")}
            checked={whole || options.allPages}
            disabled={busy || options.allPages}
            onCheckedChange={setWhole}
          />
        </label>
      )}
      {pageCount > 1 && (
        <label className="switch-row">
          <span>{t("exportPanel:allArtboards")}</span>
          <Switch
            aria-label={t("exportPanel:allArtboards")}
            checked={options.allPages}
            disabled={busy}
            onCheckedChange={(allPages) => setOptions({ ...options, allPages })}
          />
        </label>
      )}
      {failed && <p role="alert">{t("exportPanel:exportFailed")}</p>}
      <div className="export-footer">
        <Button
          variant="outline"
          onClick={() => {
            if (busy) abort.current?.abort();
            else onOpenChange(false);
          }}
        >
          {t("cancel")}
        </Button>
        <Button
          className="export-submit"
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          {busy ? <BrandStatus size={16} state="preparing" /> : <Download size={15} />}
          {t(busy ? "exporting" : "exportImage")}
        </Button>
      </div>
    </div>
  );
}
