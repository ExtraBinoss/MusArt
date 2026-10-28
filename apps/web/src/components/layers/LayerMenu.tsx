import { MoreHorizontal, Copy, Trash2, ScanLine } from "lucide-react";
import type { Composition, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { IconButton } from "../shared/IconButton";
import { layerSelection } from "./menu/selection";
import { layerActions } from "./menu/actions";
import "./messages";
export function LayerMenu({
  engine,
  page,
  selection,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  selection: string[];
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation();
  const state = layerSelection(page, selection),
    actions = layerActions(engine, page, run);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={t("layerActions")}>
          <MoreHorizontal size={15} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!state.editable} onSelect={actions.duplicate}>
          <Copy size={14} />
          {t("duplicateLayer")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!state.editable || selection.length < 2}
          onSelect={actions.mask}
        >
          <ScanLine size={14} />
          {t("createMask")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!state.editable}
          variant="destructive"
          onSelect={actions.remove}
        >
          <Trash2 size={14} />
          {t("layerControls:deleteSelection", { count: selection.length })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
