import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive } from "lucide-react";
import type { EditorServices, ProjectInsights, ProjectSummary } from "../../../state/contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { Throbber } from "../../ui/throbber/Throbber";
import { StorageBreakdown } from "./StorageBreakdown";
import { HistoryDetails } from "./HistoryDetails";
import { formatBytes } from "./format-bytes";
export function ProjectInsightsDialog({
  project,
  services,
  revision,
  onClose,
  onClearHistory,
}: {
  project: ProjectSummary;
  services: EditorServices;
  revision: number;
  onClose: () => void;
  onClearHistory: () => void;
}) {
  const { t, i18n } = useTranslation();
  const content = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ProjectInsights | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    void services.projectInsights(project.id).then(
      (value) => {
        if (live) {
          setData(value);
          setFailed(false);
        }
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [services, project.id, revision, retry]);
  const bytes = (value: number) => formatBytes(value, i18n.language);
  const sections = data
    ? [
        { key: "storedDocument", label: t("storedDocument"), value: data.bytes.manifest },
        { key: "storedOriginals", label: t("storedOriginals"), value: data.bytes.assets },
        { key: "storedPreviews", label: t("storedPreviews"), value: data.bytes.thumbnails },
        {
          key: "storedHistory",
          label: t("storedHistory"),
          details: <HistoryDetails data={data} onClear={onClearHistory} />,
          value:
            data.bytes.historyEvents +
            data.bytes.historyAssets +
            data.bytes.historyBase +
            data.bytes.historyMetadata,
        },
      ]
    : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={content}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          content.current?.focus({ preventScroll: true });
        }}
        closeLabel={t("close")}
        aria-busy={!data && !failed}
        className="floating-panel project-insights-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            <HardDrive size={18} />
            {t("projectStorage")}
          </DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <div className="insights-status">
            <p role="alert">{t("insightsUnavailable")}</p>
            <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
              {t("retry")}
            </Button>
          </div>
        ) : !data ? (
          <div className="insights-status">
            <Throbber label={t("loadingInsights")} variant="shimmer" size={28} />
          </div>
        ) : (
          <>
            <div className="project-storage-total">
              <strong>{bytes(data.bytes.total)}</strong>
              <InfoTooltip label={t("storageSizeHelp")}>
                <span>{t("logicalStorageHint")}</span>
                {data.origin?.quota !== undefined && (
                  <span className="storage-estimate-help">
                    {t("originStorageEstimate", {
                      usage: bytes(data.origin.usage ?? 0),
                      quota: bytes(data.origin.quota),
                    })}
                  </span>
                )}
              </InfoTooltip>
            </div>
            <StorageBreakdown sections={sections} label={t("storageDistribution")} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
