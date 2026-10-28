import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  BetweenHorizontalStart,
  BetweenVerticalStart,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort, Layer } from "@musart/core";
import { IconButton } from "../shared/IconButton";
import { alignmentReference } from "./alignment/reference";
import "../layers/messages";
export function AlignmentPanel({
  engine,
  selected,
  run,
}: {
  engine: EnginePort;
  selected: Layer[];
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation();
  const relativeTo = alignmentReference(selected);
  const ids = selected.map((layer) => layer.id);
  const siblings = selected.every((layer) => layer.parentId === selected[0]?.parentId);
  return (
    <section
      className="inspector-section alignment-section"
      aria-label={t(
        `layerControls:align${relativeTo === "parent" ? "Parent" : relativeTo === "selection" ? "Selection" : "Page"}`,
      )}
    >
      <div className="section-title">
        <h3>{t("alignDistribute")}</h3>
      </div>
      <div className="alignment-tools">
        {(
          [
            ["x", "start", AlignStartVertical, "alignLayerLeft"],
            ["x", "center", AlignCenterVertical, "alignLayerCenterX"],
            ["x", "end", AlignEndVertical, "alignLayerRight"],
            ["y", "start", AlignStartHorizontal, "alignLayerTop"],
            ["y", "center", AlignCenterHorizontal, "alignLayerCenterY"],
            ["y", "end", AlignEndHorizontal, "alignLayerBottom"],
          ] as const
        ).map(([axis, alignment, Icon, key]) => (
          <IconButton
            key={key}
            label={t(key)}
            disabled={!ids.length}
            onClick={() =>
              run(() => engine.execute({ type: "alignLayers", ids, axis, alignment, relativeTo }))
            }
          >
            <Icon size={15} />
          </IconButton>
        ))}
        <IconButton
          label={t("distributeX")}
          disabled={ids.length < 3 || !siblings}
          onClick={() => run(() => engine.execute({ type: "distributeLayers", ids, axis: "x" }))}
        >
          <BetweenHorizontalStart size={15} />
        </IconButton>
        <IconButton
          label={t("distributeY")}
          disabled={ids.length < 3 || !siblings}
          onClick={() => run(() => engine.execute({ type: "distributeLayers", ids, axis: "y" }))}
        >
          <BetweenVerticalStart size={15} />
        </IconButton>
      </div>
    </section>
  );
}
