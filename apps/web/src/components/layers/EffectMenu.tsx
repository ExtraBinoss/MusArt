import { useTranslation } from "react-i18next";
import { EFFECT_CATALOG, type EffectType } from "@musart/core";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
export function EffectMenu({ onAdd }: { onAdd: (type: EffectType) => void }) {
  const { t } = useTranslation();
  return (
    <>
      {(["effect", "adjustment"] as const).map((category) => (
        <DropdownMenuSub key={category}>
          <DropdownMenuSubTrigger>
            {t(category === "effect" ? "addEffect" : "addAdjustment")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="effect-catalog-menu">
            {Object.values(EFFECT_CATALOG)
              .filter((item) => item.category === category)
              .map((item) => (
                <DropdownMenuItem key={item.type} onSelect={() => onAdd(item.type)}>
                  {t(item.nameKey)}
                </DropdownMenuItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}
