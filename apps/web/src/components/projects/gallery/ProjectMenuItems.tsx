import { Copy, Pencil, Trash2, HardDrive, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../ui/dropdown-menu";
import { ContextMenuItem, ContextMenuSeparator } from "../../ui/context-menu";

export interface ProjectMenuActions {
  rename: () => void;
  duplicate: () => void;
  insights: () => void;
  clearHistory: () => void;
  remove: () => void;
}
/** One action list for the visible menu and native right-click, including the destructive divider. */
export function ProjectMenuItems({
  actions,
  disabled,
  context = false,
}: {
  actions: ProjectMenuActions;
  disabled: boolean;
  context?: boolean;
}) {
  const { t } = useTranslation();
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
  return (
    <>
      <Item disabled={disabled} onSelect={actions.rename}>
        <Pencil size={14} />
        {t("renameProject")}
      </Item>
      <Item disabled={disabled} onSelect={actions.duplicate}>
        <Copy size={14} />
        {t("duplicate")}
      </Item>
      <Item disabled={disabled} onSelect={actions.insights}>
        <HardDrive size={14} />
        {t("projectStorage")}
      </Item>
      <Item disabled={disabled} onSelect={actions.clearHistory}>
        <History size={14} />
        {t("clearHistory")}
      </Item>
      <Separator />
      <Item disabled={disabled} variant="destructive" onSelect={actions.remove}>
        <Trash2 size={14} />
        {t("delete")}
      </Item>
    </>
  );
}
