import { useMemo, useState, type MutableRefObject } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Label } from "../ui/label";
import { SelectField } from "../shared/SelectField";
import { ExportSettings } from "./ExportSettings";
import { MotionExportSettings } from "./MotionExportSettings";
import type { ExportPopoverProps } from "./model";
const emptySelection: readonly string[] = Object.freeze([]);

/** One canonical snapshot, explicit durable artboard choice, and automatic authored-mode routing. */
export function CompositionExportSettings({
  engine,
  initialCompositionId,
  pendingRef,
  ...props
}: Omit<ExportPopoverProps, "open" | "engine"> & {
  engine: EnginePort;
  pendingRef: MutableRefObject<boolean>;
}) {
  const { t } = useTranslation("exportPanel");
  const { services: sourceServices } = props;
  const [origin] = useState(() => engine.getSnapshot());
  const [compositionId, setCompositionId] = useState(initialCompositionId ?? origin.pageId);
  const [busy, setBusy] = useState(false);
  const page =
    origin.project.pages.find((item) => item.id === compositionId) ?? origin.project.pages[0]!;
  const selection = page.id === origin.pageId ? origin.selection : emptySelection;
  const scope = useMemo(
    () => ({
      projectId: origin.project.id,
      compositionId: page.id,
      revision: origin.revision,
      page,
    }),
    [origin, page],
  );
  const services = useMemo(
    () => ({
      ...sourceServices,
      ...(sourceServices.previewExport
        ? {
            previewExport: (
              options: Parameters<NonNullable<typeof sourceServices.previewExport>>[0],
              signal?: AbortSignal,
            ) => sourceServices.previewExport!({ ...options, pageId: page.id }, signal),
          }
        : {}),
      exportImage: async (options: Parameters<typeof sourceServices.exportImage>[0]) => {
        if (sourceServices.exportComposition)
          await sourceServices.exportComposition(
            {
              mode: "static",
              compositionId: page.id,
              scale: options.scale,
              image: options,
              selection,
              signal: options.signal,
            },
            scope,
          );
        else if (page.id === origin.pageId)
          await sourceServices.exportImage(options, { page, revision: origin.revision, selection });
        else throw new Error(t("unavailable"));
      },
    }),
    [sourceServices, origin, page, scope, selection, t],
  );
  return (
    <div className="composition-export-settings">
      <div className="export-artboard-picker">
        <Label htmlFor="export-artboard">{t("chooseArtboard")}</Label>
        <SelectField
          id="export-artboard"
          label={t("chooseArtboard")}
          value={page.id}
          disabled={busy}
          identity={origin.project}
          options={origin.project.pages.map((item) => ({ value: item.id, label: item.name }))}
          onValueChange={(id) => {
            if (!pendingRef.current) setCompositionId(id);
          }}
        />
      </div>
      {page.motion?.mode === "motion" ? (
        <MotionExportSettings
          key={page.id}
          {...props}
          page={page}
          project={origin.project}
          scope={scope}
          pendingRef={pendingRef}
          onPendingChange={setBusy}
        />
      ) : (
        <ExportSettings
          key={page.id}
          {...props}
          services={services}
          page={page}
          pageCount={origin.project.pages.length}
          selection={selection}
          revision={origin.revision}
          pendingRef={pendingRef}
          onPendingChange={setBusy}
        />
      )}
    </div>
  );
}
