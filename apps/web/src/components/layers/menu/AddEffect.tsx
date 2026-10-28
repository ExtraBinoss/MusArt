import { Sparkles, SlidersHorizontal } from "lucide-react";
import { memo, useRef } from "react";
import { EFFECT_CATALOG, type Composition, type EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../ui/dropdown-menu";
import { IconButton } from "../../shared/IconButton";
import { layerSelection } from "./selection";
import { layerActions } from "./actions";
import { useRenderMetrics } from "../../../state/session/render-metrics";
export const AddEffect = memo(function AddEffect({
  engine,
  page,
  selection,
  run,
  category,
}: {
  engine: EnginePort;
  page: Composition;
  selection: string[];
  run: (task: () => void) => void;
  category: "effect" | "adjustment";
}) {
  const element = useRef<HTMLButtonElement>(null);
  useRenderMetrics(element);
  const { t } = useTranslation();
  const state = layerSelection(page, selection),
    actions = layerActions(engine, page, run);
  const Icon = category === "effect" ? Sparkles : SlidersHorizontal;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          ref={element}
          data-layer-add-category={category}
          label={t(category === "effect" ? "addEffect" : "addAdjustment")}
          disabled={!state.editable}
        >
          <Icon size={15} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="effect-catalog-menu">
        {Object.values(EFFECT_CATALOG)
          .filter((item) => item.category === category)
          .map((item) => (
            <DropdownMenuItem key={item.type} onSelect={() => actions.effect(item.type)}>
              {t(item.nameKey)}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
