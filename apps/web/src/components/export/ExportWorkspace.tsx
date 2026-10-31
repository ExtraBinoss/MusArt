import { freezeEffectPreviews } from "../../state/session/effect-preview";
import { createMotionTransport } from "../../services/motion/transport";
import { SegmentedTabs } from "../shared/segmented/SegmentedTabs";
import "./workspace.css";
import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../state/contracts";
import { getExportJobs, type ExportKind } from "../../services/export/jobs";
import { SelectField } from "../shared/SelectField";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { ImageExportPane } from "./ImageExportPane";
import { MotionExportPane } from "./MotionExportPane";
import { TimelapseExportPane } from "./TimelapseExportPane";

const empty: readonly string[] = Object.freeze([]);
export function ExportWorkspace({
  engine,
  services,
  initialCompositionId,
  initialKind,
  onClose,
}: {
  engine: EnginePort;
  services: EditorServices;
  initialCompositionId?: string;
  initialKind?: ExportKind;
  onClose: () => void;
}) {
  const { t } = useTranslation("exportPanel");
  useLayoutEffect(() => {
    freezeEffectPreviews(engine);
    createMotionTransport(engine).pause();
  }, [engine]);
  const [origin] = useState(() => engine.getSnapshot());
  const [pageId, setPageId] = useState(initialCompositionId ?? origin.pageId);
  const page = origin.project.pages.find((item) => item.id === pageId) ?? origin.project.pages[0]!;
  const [kind, setKind] = useState<ExportKind>(
    initialKind ?? (page.motion?.mode === "motion" ? "motion" : "image"),
  );
  const [whole, setWhole] = useState(false);
  const [allPages, setAllPages] = useState(false);
  const jobs = getExportJobs(engine);
  const busy = useSyncExternalStore(
    jobs.subscribe,
    () => jobs.pending,
    () => false,
  );
  const selected = page.id === origin.pageId ? origin.selection : empty;
  const selection = !whole && !allPages ? selected : empty;
  const controls = (
    <>
      <div className="export-field">
        <Label htmlFor="export-artboard">{t("chooseArtboard")}</Label>
        <SelectField
          id="export-artboard"
          label={t("chooseArtboard")}
          value={page.id}
          disabled={busy}
          options={origin.project.pages.map((item) => ({ value: item.id, label: item.name }))}
          onValueChange={(id) => {
            setPageId(id);
            setWhole(false);
            setAllPages(false);
            const next = origin.project.pages.find((item) => item.id === id)!;
            if (kind !== "timelapse") setKind(next.motion?.mode === "motion" ? "motion" : "image");
          }}
        />
      </div>
      <div className="export-field">
        <Label>{t("output")}</Label>
        <SegmentedTabs
          mode="choice"
          size="compact"
          label={t("output")}
          value={kind}
          disabled={busy}
          items={[
            { value: "image", label: t("image") },
            ...(page.motion?.mode === "motion" ? [{ value: "motion", label: t("motion") }] : []),
            { value: "timelapse", label: t("timelapse") },
          ]}
          onValueChange={(value) => {
            setKind(value as ExportKind);
            setAllPages(false);
          }}
        />
      </div>
      {selected.length > 0 && (
        <label className="switch-row">
          <span>{t("whole")}</span>
          <Switch
            checked={whole || allPages}
            disabled={busy || allPages}
            aria-label={t("whole")}
            onCheckedChange={setWhole}
          />
        </label>
      )}
      <p className="export-scope">
        {allPages
          ? t("allArtboards")
          : selection.length
            ? t("selection", { count: selection.length })
            : t("artboard", { name: page.name })}
      </p>
    </>
  );
  const scopedServices = useMemo(
    () => ({
      ...services,
      ...(services.previewExport
        ? {
            previewExport: (
              options: Parameters<NonNullable<EditorServices["previewExport"]>>[0],
              signal?: AbortSignal,
            ) => services.previewExport!({ ...options, pageId: page.id }, signal),
          }
        : {}),
    }),
    [services, page.id],
  );
  const props = { engine, services: scopedServices, origin, page, selection, controls, onClose };
  return kind === "motion" ? (
    <MotionExportPane key={page.id} {...props} />
  ) : kind === "timelapse" ? (
    <TimelapseExportPane key={page.id} {...props} />
  ) : (
    <ImageExportPane key={page.id} {...props} allPages={allPages} onAllPagesChange={setAllPages} />
  );
}
