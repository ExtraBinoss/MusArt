import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { captureLayerRename, commitLayerRename } from "../layers/rename/session";
import { InlineTimelineName } from "./InlineTimelineName";
import "../layers/messages";

/** Visual layer adapter; audio rows supply their own typed name command to InlineTimelineName. */
export function TimelineLayerName({
  engine,
  compositionId,
  layerId,
  name,
  label,
  interactive = true,
  onSelect,
}: {
  engine: EnginePort;
  compositionId: string;
  layerId: string;
  name: string;
  label: string;
  interactive?: boolean;
  onSelect: (additive: boolean) => void;
}) {
  const { t } = useTranslation();
  const identity = useMemo(
    () => ({ engine, compositionId, layerId }),
    [engine, compositionId, layerId],
  );
  return (
    <InlineTimelineName
      identity={identity}
      name={name}
      label={label}
      interactive={interactive}
      renameLabel={t("renameLayer")}
      changedLabel={t("layerControls:renameChanged")}
      failedLabel={t("layerControls:renameFailed")}
      onSelect={onSelect}
      capture={() => captureLayerRename(engine, compositionId, layerId)}
      commit={(origin, draft) => commitLayerRename(engine, origin, draft)}
    />
  );
}
