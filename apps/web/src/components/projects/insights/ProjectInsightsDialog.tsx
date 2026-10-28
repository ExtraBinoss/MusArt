import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, History, LoaderCircle, Trash2 } from "lucide-react";
import type { EditorServices, ProjectInsights, ProjectSummary } from "../../../state/contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
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
        { key: "storedDocument", value: data.bytes.manifest },
        { key: "storedOriginals", value: data.bytes.assets },
        { key: "storedPreviews", value: data.bytes.thumbnails },
        {
          key: "storedHistory",
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
      <DialogContent closeLabel={t("close")} className="floating-panel project-insights-dialog">
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
          <div className="insights-status" role="status">
            <LoaderCircle size={20} className="animate-spin" />
            {t("loadingInsights")}
          </div>
        ) : (
          <>
            <div className="project-storage-total">
              <strong>{bytes(data.bytes.total)}</strong>
              <span>{t("logicalStorageSize")}</span>
            </div>
            <div className="storage-distribution" role="img" aria-label={t("storageDistribution")}>
              {sections.map((section, index) => (
                <span
                  key={section.key}
                  className={`storage-segment storage-segment-${index}`}
                  style={{ width: `${(section.value / Math.max(1, data.bytes.total)) * 100}%` }}
                />
              ))}
            </div>
            <dl className="storage-breakdown">
              {sections.map((section, index) => (
                <div key={section.key}>
                  <dt>
                    <span className={`storage-dot storage-segment-${index}`} />
                    {t(section.key)}
                  </dt>
                  <dd>{bytes(section.value)}</dd>
                </div>
              ))}
            </dl>
            <div className="history-storage-detail">
              <h3>
                <History size={15} />
                {t("historyStorageDetail")}
              </h3>
              <p>
                {t("historyEntryUsage", {
                  count: data.history.count,
                  limit: data.history.limit.toLocaleString(i18n.language),
                })}
              </p>
              <dl>
                {(
                  ["historyEvents", "historyAssets", "historyBase", "historyMetadata"] as const
                ).map((key) => (
                  <div key={key}>
                    <dt>{t(key)}</dt>
                    <dd>{bytes(data.bytes[key])}</dd>
                  </div>
                ))}
              </dl>
              <p className="muted-description">
                {t(data.history.enabled ? "historyRecordingEnabled" : "historyRecordingPaused")}
              </p>
              <Button variant="outline" onClick={onClearHistory} disabled={!data.history.count}>
                <Trash2 size={13} />
                {t("clearHistory")}
              </Button>
            </div>
            {data.origin?.quota !== undefined && (
              <p className="origin-storage-estimate">
                {t("originStorageEstimate", {
                  usage: bytes(data.origin.usage ?? 0),
                  quota: bytes(data.origin.quota),
                })}
              </p>
            )}
            <p className="muted-description">{t("logicalStorageHint")}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
