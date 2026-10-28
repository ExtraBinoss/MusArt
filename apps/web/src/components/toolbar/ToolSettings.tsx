import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toolAtom } from "../../state/session/editor";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
import { WandOptions } from "./wand/WandOptions";
import { SegmentationModel } from "./segmentation/SegmentationModel";

export function ToolSettings({
  services,
  onTask,
}: {
  services: EditorServices;
  onTask: TaskRunner;
}) {
  const { t } = useTranslation(),
    tool = useAtomValue(toolAtom);
  if (tool !== "wand" && tool !== "segment") return null;
  return (
    <aside className="tool-settings floating-panel" aria-label={t(tool)}>
      {tool === "wand" ? (
        <WandOptions />
      ) : (
        <SegmentationModel services={services} onTask={onTask} />
      )}
    </aside>
  );
}
