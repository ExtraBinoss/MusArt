import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../ui/dropdown-menu";
import { ContextMenuItem, ContextMenuSeparator } from "../../ui/context-menu";

export interface ProjectMenuActions {
  rename: () => void;
  duplicate: () => void;
  insights: () => void;
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
        {t("renameProject")}
      </Item>
      <Item disabled={disabled} onSelect={actions.duplicate}>
        {t("duplicate")}
      </Item>
      <Separator />
      <Item disabled={disabled} variant="destructive" onSelect={actions.remove}>
        {t("delete")}
        <Trash2 size={14} className="ml-auto" />
      </Item>
      <Separator />
      <Item
        disabled={disabled}
        className="text-muted-foreground text-xs"
        onSelect={actions.insights}
      >
        {t("projectStorage")}
      </Item>
    </>
  );
}
