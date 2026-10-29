import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { EFFECT_CATALOG, type EffectType } from "@musart/core";
import "../properties/effects/library-messages";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuPortal,
} from "../ui/dropdown-menu";
export function EffectMenu({ onAdd }: { onAdd: (type: EffectType) => void }) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<"effect" | "adjustment" | null>(null);
  const catalog = useMemo(() => {
    const collator = new Intl.Collator(i18n.resolvedLanguage ?? i18n.language, {
      sensitivity: "base",
      numeric: true,
    });
    return Object.values(EFFECT_CATALOG)
      .map((item) => ({ item, label: t(item.nameKey) }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [i18n.resolvedLanguage, i18n.language, t]);
  return (
    <>
      {(["effect", "adjustment"] as const).map((category) => (
        <DropdownMenuSub
          key={category}
          open={active === category}
          onOpenChange={(open) => {
            setActive((current) => (open ? category : current === category ? null : current));
          }}
        >
          <DropdownMenuSubTrigger
            className="hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            onPointerEnter={(event) => {
              // These are explicit sibling choices. Radix's diagonal grace corridor must not
              // suppress a deliberate vertical hover onto the other category.
              if (event.pointerType !== "mouse" || event.buttons !== 0) return;
              event.currentTarget.focus({ preventScroll: true });
              setActive(category);
            }}
          >
            {t(category === "effect" ? "addEffect" : "addAdjustment")}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="effect-catalog-menu">
              {catalog
                .filter(({ item }) => item.category === category)
                .map(({ item, label }) => (
                  <DropdownMenuItem key={item.type} onSelect={() => onAdd(item.type)}>
                    {label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      ))}
    </>
  );
}
