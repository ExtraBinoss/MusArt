import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { EffectType } from "@musart/core";
import "../properties/effects/library-messages";
import "../motion/transitions/messages";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "../ui/dropdown-menu";
import { EffectCatalog } from "./catalog/EffectCatalog";
export function EffectMenu({ onAdd }: { onAdd: (type: EffectType) => void }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<"effect" | "adjustment" | null>(null);
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
              <EffectCatalog category={category} onAdd={onAdd} />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      ))}
    </>
  );
}
