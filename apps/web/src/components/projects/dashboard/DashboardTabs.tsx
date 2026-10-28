import { FolderOpen, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import "./messages";

const sections = [
  ["projects", FolderOpen],
  ["templates", LayoutTemplate],
] as const;
export function DashboardTabs({ value, disabled = false }: { value: string; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <SegmentedTabs
      value={value}
      disabled={disabled}
      label={t("dashboard:tabs")}
      className="dashboard-tabs"
      itemClassName="dashboard-tab"
      indicatorClassName="dashboard-tab-indicator"
      items={sections.map(([section, Icon]) => ({
        value: section,
        label: t(`dashboard:${section}`),
        icon: <Icon size={15} />,
      }))}
    />
  );
}
