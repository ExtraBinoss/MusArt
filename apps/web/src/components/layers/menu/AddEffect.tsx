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
import "../../properties/effects/library-messages";
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
  const state = layerSelection(page, selection);
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
        <EffectOptions engine={engine} page={page} run={run} category={category} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

/** Radix only mounts this subtree while the menu content is actually present. */
function EffectOptions({
  engine,
  page,
  run,
  category,
}: {
  engine: EnginePort;
  page: Composition;
  run: (task: () => void) => void;
  category: "effect" | "adjustment";
}) {
  const { t, i18n } = useTranslation();
  const collator = new Intl.Collator(i18n.resolvedLanguage ?? i18n.language, {
    sensitivity: "base",
    numeric: true,
  });
  const actions = layerActions(engine, page, run);
  return (
    <>
      {Object.values(EFFECT_CATALOG)
        .filter((item) => item.category === category)
        .map((item) => ({ item, label: t(item.nameKey) }))
        .sort((a, b) => collator.compare(a.label, b.label))
        .map(({ item, label }) => (
          <DropdownMenuItem key={item.type} onSelect={() => actions.effect(item.type)}>
            {label}
          </DropdownMenuItem>
        ))}
    </>
  );
}
