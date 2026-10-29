import { useTranslation } from "react-i18next";
import { EFFECT_CATALOG, type EffectType } from "@musart/core";
import "../properties/effects/library-messages";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
export function EffectMenu({ onAdd }: { onAdd: (type: EffectType) => void }) {
  const { t, i18n } = useTranslation();
  const collator = new Intl.Collator(i18n.resolvedLanguage ?? i18n.language, {
    sensitivity: "base",
    numeric: true,
  });
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
              .map((item) => ({ item, label: t(item.nameKey) }))
              .sort((a, b) => collator.compare(a.label, b.label))
              .map(({ item, label }) => (
                <DropdownMenuItem key={item.type} onSelect={() => onAdd(item.type)}>
                  {label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}
