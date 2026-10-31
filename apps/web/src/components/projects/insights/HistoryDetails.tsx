import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectInsights } from "../../../state/contracts";
import { InfoPopover } from "../../shared/InfoPopover";
import { Button } from "../../ui/button";
import { StorageBreakdown } from "./StorageBreakdown";

export function HistoryDetails({ data, onClear }: { data: ProjectInsights; onClear: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <InfoPopover
      label={t("historyStorageDetail")}
      open={open}
      onOpenChange={setOpen}
      className="history-storage-popover"
    >
      <h3>{t("historyStorageDetail")}</h3>
      <p>{t("recordedHistoryHint")}</p>
      <StorageBreakdown
        label={t("historyDistribution")}
        sections={(
          ["historyEvents", "historyAssets", "historyBase", "historyMetadata"] as const
        ).map((key) => ({ key, label: t(key), value: data.bytes[key] }))}
      />
      <div className="history-storage-footer">
        <span>
          {t("historyEntryCount", { count: data.history.count })}
          {!data.history.enabled && <small>{t("historyRecordingPaused")}</small>}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data.history.count}
          onClick={() => {
            setOpen(false);
            onClear();
          }}
        >
          {t("clearHistory")}
        </Button>
      </div>
    </InfoPopover>
  );
}
