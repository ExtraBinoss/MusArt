import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Scan, LoaderCircle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toolAtom, toleranceAtom } from "../../state/session/editor";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
import { Button } from "../ui/button";
import { NumberInput } from "../shared/NumberInput";

export function ToolSettings({
  services,
  onTask,
}: {
  services: EditorServices;
  onTask: TaskRunner;
}) {
  const { t } = useTranslation();
  const tool = useAtomValue(toolAtom);
  const [tolerance, setTolerance] = useAtom(toleranceAtom);
  const [model, setModel] = useState<"idle" | "loading" | "ready">("idle");
  if (tool !== "wand" && tool !== "segment") return null;
  async function prepare() {
    setModel("loading");
    const ok = await onTask(services.prepareSegmentation);
    setModel(ok ? "ready" : "idle");
  }
  return (
    <aside className="tool-settings floating-panel" aria-label={t(tool)}>
      <strong>{t(tool)}</strong>
      <p>{t(tool === "wand" ? "wandHint" : "segmentHint")}</p>
      {tool === "wand" ? (
        <NumberInput
          key={tolerance}
          label={t("tolerance")}
          min={0}
          max={255}
          value={tolerance}
          onCommit={setTolerance}
        />
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={model !== "idle"}
            onClick={() => {
              void prepare();
            }}
          >
            {model === "loading" ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : model === "ready" ? (
              <Check size={14} />
            ) : (
              <Scan size={14} />
            )}
            {t(
              model === "idle"
                ? "prepareModel"
                : model === "loading"
                  ? "modelLoading"
                  : "modelReady",
            )}
          </Button>
          <small>{t("modelHint")}</small>
        </>
      )}
    </aside>
  );
}
