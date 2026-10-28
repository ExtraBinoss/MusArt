import { useId } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { FolderOpen, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TabsList, TabsTrigger } from "../../ui/tabs";
import "./messages";

const sections = [
  ["projects", FolderOpen],
  ["templates", LayoutTemplate],
] as const;
export function DashboardTabs({ value, disabled = false }: { value: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const id = useId(),
    reduced = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <TabsList aria-label={t("dashboard:tabs")} className="dashboard-tabs">
        {sections.map(([section, Icon]) => (
          <TabsTrigger key={section} value={section} disabled={disabled} className="dashboard-tab">
            {value === section && (
              <motion.span
                aria-hidden
                className="dashboard-tab-indicator"
                layoutId="dashboard-active-tab"
                initial={false}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 460, damping: 38, mass: 0.7 }
                }
              />
            )}
            <Icon size={15} />
            <span>{t(`dashboard:${section}`)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </LayoutGroup>
  );
}
