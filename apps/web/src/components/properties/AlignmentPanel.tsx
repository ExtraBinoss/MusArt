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
import { ButtonGroup } from "../ui/button-group";
import { alignmentReference } from "./alignment/reference";
import "../layers/messages";
export function AlignmentPanel({
  engine,
  selected,
  run,
}: {
  engine: EnginePort;
  selected: readonly Layer[];
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
        {(["x", "y"] as const).map((axis) => {
          const controls =
            axis === "x"
              ? ([
                  ["start", AlignStartVertical, "alignLayerLeft"],
                  ["center", AlignCenterVertical, "alignLayerCenterX"],
                  ["end", AlignEndVertical, "alignLayerRight"],
                ] as const)
              : ([
                  ["start", AlignStartHorizontal, "alignLayerTop"],
                  ["center", AlignCenterHorizontal, "alignLayerCenterY"],
                  ["end", AlignEndHorizontal, "alignLayerBottom"],
                ] as const);
          const DistributeIcon = axis === "x" ? BetweenHorizontalStart : BetweenVerticalStart;
          return (
            <ButtonGroup
              key={axis}
              aria-label={t(axis === "x" ? "alignmentHorizontal" : "alignmentVertical")}
            >
              {controls.map(([alignment, Icon, key]) => (
                <IconButton
                  key={key}
                  label={t(key)}
                  disabled={!ids.length}
                  onClick={() =>
                    run(() =>
                      engine.execute({ type: "alignLayers", ids, axis, alignment, relativeTo }),
                    )
                  }
                >
                  <Icon size={15} />
                </IconButton>
              ))}
              <IconButton
                label={t(axis === "x" ? "distributeX" : "distributeY")}
                disabled={ids.length < 3 || !siblings}
                onClick={() => run(() => engine.execute({ type: "distributeLayers", ids, axis }))}
              >
                <DistributeIcon size={15} />
              </IconButton>
            </ButtonGroup>
          );
        })}
      </div>
    </section>
  );
}
